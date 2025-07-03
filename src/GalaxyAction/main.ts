import {
    BasicRateLimiter,
    Chapter,
    ChapterDetails,
    ChapterProviding,
    ContentRating,
    DiscoverSection,
    DiscoverSectionItem,
    DiscoverSectionProviding,
    DiscoverSectionType,
    Extension,
    Form,
    MangaProviding,
    PagedResults,
    Request,
    SearchFilter,
    SearchQuery,
    SearchResultItem,
    SearchResultsProviding,
    SettingsFormProviding,
    SourceManga,
    TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { CheerioAPI } from "cheerio";
import { GalaxyActionInterceptor } from "./GalaxyActionInterceptor";
import { GalaxyActionSettingsForm } from "./GalaxyActionSettings";

const baseUrl = "https://galaxyaction.net";

type GalaxyActionImplementation = Extension &
    SearchResultsProviding &
    MangaProviding &
    ChapterProviding &
    SettingsFormProviding &
    DiscoverSectionProviding;

export class GalaxyActionExtension implements GalaxyActionImplementation {
    requestManager = new GalaxyActionInterceptor("main");
    globalRateLimiter = new BasicRateLimiter("rateLimiter", {
        numberOfRequests: 10,
        bufferInterval: 1,
        ignoreImages: true,
    });

    async initialise(): Promise<void> {
        this.requestManager.registerInterceptor();
        this.globalRateLimiter.registerInterceptor();
    }

    async getDiscoverSections(): Promise<DiscoverSection[]> {
        return [
            {
                id: "popular_section",
                title: "Popular",
                type: DiscoverSectionType.featured,
            },
            {
                id: "updated_section",
                title: "Recently Updated",
                type: DiscoverSectionType.chapterUpdates,
            },
            {
                id: "new_manga_section",
                title: "New Manga",
                type: DiscoverSectionType.simpleCarousel,
            },
            {
                id: "genres_section",
                title: "Genres",
                type: DiscoverSectionType.genres,
            },
        ];
    }

    async getSettingsForm(): Promise<Form> {
        return new GalaxyActionSettingsForm();
    }

    async getDiscoverSectionItems(
        section: DiscoverSection,
        metadata: GalaxyAction.Metadata | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        switch (section.id) {
            case "popular_section":
                return this.getPopularSectionItems(section, metadata);
            case "updated_section":
                return this.getUpdatedSectionItems(section, metadata);
            case "new_manga_section":
                return this.getNewMangaSectionItems(section, metadata);
            case "genres_section":
                return this.getGenresSection();
            default:
                return { items: [] };
        }
    }

    async getSearchFilters(): Promise<SearchFilter[]> {
        const filters: SearchFilter[] = [];

        // Type filter
        filters.push({
            id: "type",
            type: "dropdown",
            options: [
                { id: "all", value: "All" },
                { id: "manga", value: "Manga" },
                { id: "manhwa", value: "Manhwa" },
                { id: "manhua", value: "Manhua" },
                { id: "comic", value: "Comic" },
                { id: "novel", value: "Novel" },
            ],
            value: "all",
            title: "Type Filter",
        });

        // Status filter
        filters.push({
            id: "status",
            type: "dropdown",
            options: [
                { id: "all", value: "All" },
                { id: "ongoing", value: "Ongoing" },
                { id: "completed", value: "Completed" },
                { id: "hiatus", value: "Hiatus" },
                { id: "cancelled", value: "Cancelled" },
                { id: "dropped", value: "Dropped" },
                { id: "new", value: "New" },
            ],
            value: "all",
            title: "Status Filter",
        });

        // Order filter
        filters.push({
            id: "order",
            type: "dropdown",
            options: [
                { id: "", value: "Default" },
                { id: "title", value: "A-Z" },
                { id: "titlereverse", value: "Z-A" },
                { id: "update", value: "Update" },
                { id: "latest", value: "Added" },
                { id: "popular", value: "Popular" },
            ],
            value: "",
            title: "Order by",
        });

        return filters;
    }

    async getSearchResults(
        query: SearchQuery,
        metadata: { page?: number } | undefined,
    ): Promise<PagedResults<SearchResultItem>> {
        const page = metadata?.page ?? 1;
        
        // Build search URL
        let searchUrl = `${baseUrl}/manga/`;
        const params = new URLSearchParams();
        
        if (query.title && query.title.trim()) {
            params.append("s", query.title.trim());
        }
        
        if (page > 1) {
            params.append("paged", page.toString());
        }

        const getFilterValue = (id: string) =>
            query.filters.find((filter: SearchFilter) => filter.id == id)?.value;

        const type = getFilterValue("type");
        const status = getFilterValue("status");
        const order = getFilterValue("order");

        if (type && type !== "all") {
            params.append("type", type);
        }

        if (status && status !== "all") {
            params.append("status", status);
        }

        if (order && order !== "") {
            params.append("order", order);
        }

        if (params.toString()) {
            searchUrl += "?" + params.toString();
        }

        const request = { url: searchUrl, method: "GET" };
        const $ = await this.fetchCheerio(request);
        
        const searchResults: SearchResultItem[] = [];
        
        $(".bs .bsx").each((_: number, element: Element) => {
            const $element = $(element);
            const title = $element.find(".tt").text().trim();
            const image = $element.find("img").attr("src") ?? "";
            const mangaUrl = $element.find("a").attr("href") ?? "";
            const mangaId = mangaUrl.split("/").filter(Boolean).pop() ?? "";
            
            if (title && mangaId) {
                searchResults.push({
                    mangaId: mangaId,
                    title: title,
                    image: image,
                    subtitle: $element.find(".epxs").text().trim(),
                });
            }
        });

        const hasNextPage = $(".pagination .next").length > 0;
        
        return {
            items: searchResults,
            metadata: hasNextPage ? { page: page + 1 } : undefined,
        };
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = {
            url: `${baseUrl}/manga/${mangaId}/`,
            method: "GET",
        };

        const $ = await this.fetchCheerio(request);
        
        const title = $("h1").first().text().trim();
        const image = $(".wp-post-image").attr("src") ?? "";
        const description = $(".entry-content p").first().text().trim();
        
        // Parse status
        const statusText = $('strong:contains("Status")').next().text().trim();
        let status = "Unknown";
        switch (statusText.toLowerCase()) {
            case "ongoing":
                status = "Ongoing";
                break;
            case "completed":
            case "complete":
                status = "Completed";
                break;
            case "hiatus":
                status = "Hiatus";
                break;
            case "cancelled":
            case "canceled":
                status = "Cancelled";
                break;
            case "dropped":
                status = "Dropped";
                break;
        }

        // Parse genres
        const genres: { id: string; title: string }[] = [];
        $('strong:contains("Genres")').siblings("a").each((_: number, element: Element) => {
            const genre = $(element).text().trim();
            const genreUrl = $(element).attr("href") ?? "";
            const genreId = genreUrl.split("/").filter(Boolean).pop() ?? genre.toLowerCase().replace(/\s+/g, "-");
            if (genre) {
                genres.push({ id: genreId, title: genre });
            }
        });

        const tagSections: TagSection[] = [
            {
                id: "genres",
                title: "Genres",
                tags: genres,
            },
        ];

        return {
            mangaId: mangaId,
            mangaInfo: {
                primaryTitle: title,
                secondaryTitles: [title],
                status: status,
                tagGroups: tagSections,
                synopsis: description,
                thumbnailUrl: image,
                contentRating: ContentRating.EVERYONE,
                shareUrl: `${baseUrl}/manga/${mangaId}/`,
            },
        };
    }

    async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
        const request = {
            url: `${baseUrl}/manga/${sourceManga.mangaId}/`,
            method: "GET",
        };

        const $ = await this.fetchCheerio(request);
        const chapters: Chapter[] = [];
        
        // Look for chapter links - this might need adjustment based on actual site structure
        $("a[href*='/chapter/'], a[href*='/read/']").each((index: number, element: Element) => {
            const $element = $(element);
            const chapterUrl = $element.attr("href") ?? "";
            const chapterText = $element.text().trim();
            
            if (chapterUrl && chapterText) {
                const chapterId = chapterUrl.split("/").filter(Boolean).pop() ?? "";
                const chapterMatch = chapterText.match(/chapter\s*(\d+(?:\.\d+)?)/i);
                const chapNum = chapterMatch ? parseFloat(chapterMatch[1]) : index + 1;
                
                chapters.push({
                    chapterId: chapterId,
                    sourceManga: sourceManga,
                    title: chapterText,
                    chapNum: chapNum,
                    sortingIndex: chapters.length,
                    langCode: "en",
                });
            }
        });

        return chapters.reverse(); // Reverse to show newest first
    }

    async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
        const request = {
            url: `${baseUrl}/manga/${chapter.sourceManga.mangaId}/${chapter.chapterId}/`,
            method: "GET",
        };

        const $ = await this.fetchCheerio(request);
        const pages: string[] = [];
        
        // Look for chapter images
        $("img[src*='wp-content'], img[src*='chapter']").each((_: number, element: Element) => {
            const imageUrl = $(element).attr("src") ?? "";
            if (imageUrl && !imageUrl.includes("avatar") && !imageUrl.includes("logo")) {
                pages.push(imageUrl);
            }
        });

        return {
            id: chapter.chapterId,
            mangaId: chapter.sourceManga.mangaId,
            pages: pages,
        };
    }

    getMangaShareUrl(mangaId: string): string {
        return `${baseUrl}/manga/${mangaId}/`;
    }

    async getUpdatedSectionItems(
        section: DiscoverSection,
        metadata: { page?: number; collectedIds?: string[] } | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        const page = metadata?.page ?? 1;
        const request = {
            url: page > 1 ? `${baseUrl}/manga/page/${page}/` : `${baseUrl}/manga/`,
            method: "GET",
        };

        const $ = await this.fetchCheerio(request);
        const items: DiscoverSectionItem[] = [];
        
        $(".bs .bsx").each((_, element) => {
            const $element = $(element);
            const title = $element.find(".tt").text().trim();
            const image = $element.find("img").attr("src") ?? "";
            const mangaUrl = $element.find("a").attr("href") ?? "";
            const mangaId = mangaUrl.split("/").filter(Boolean).pop() ?? "";
            
            if (title && mangaId) {
                items.push(createDiscoverSectionItem({
                    id: mangaId,
                    image: image,
                    title: title,
                    subtitle: $element.find(".epxs").text().trim(),
                    type: "simpleCarouselItem",
                }));
            }
        });

        const hasNextPage = $(".pagination .next").length > 0;
        
        return {
            items: items,
            metadata: hasNextPage ? { page: page + 1 } : undefined,
        };
    }

    async getPopularSectionItems(
        section: DiscoverSection,
        metadata: { page?: number; collectedIds?: string[] } | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        // For popular section, we'll use the same as updated for now
        // This could be enhanced to use a specific popular page if available
        return this.getUpdatedSectionItems(section, metadata);
    }

    async getNewMangaSectionItems(
        section: DiscoverSection,
        metadata: { page?: number; collectedIds?: string[] } | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        // For new manga section, we'll use the same as updated for now
        // This could be enhanced to use a specific new manga page if available
        return this.getUpdatedSectionItems(section, metadata);
    }

    async getGenresSection(): Promise<PagedResults<DiscoverSectionItem>> {
        const request = {
            url: `${baseUrl}/manga/`,
            method: "GET",
        };

        const $ = await this.fetchCheerio(request);
        const items: DiscoverSectionItem[] = [];
        
        $(".genre a").each((_, element) => {
            const $element = $(element);
            const genreName = $element.text().trim();
            const genreUrl = $element.attr("href") ?? "";
            const genreId = genreUrl.split("/").filter(Boolean).pop() ?? genreName.toLowerCase().replace(/\s+/g, "-");
            
            if (genreName) {
                items.push(createDiscoverSectionItem({
                    id: genreId,
                    image: "", // Genres don't have images
                    title: genreName,
                    type: "simpleCarouselItem",
                }));
            }
        });

        return { items: items };
    }

    async fetchCheerio(request: Request): Promise<CheerioAPI> {
        const response = await Application.scheduleRequest(request);
        const data = response[1];
        const html = Application.arrayBufferToUTF8String(data);
        return cheerio.load(html);
    }
}

function createDiscoverSectionItem(options: {
    id: string;
    image: string;
    title: string;
    subtitle?: string;
    type: "simpleCarouselItem";
}): DiscoverSectionItem {
    return {
        id: options.id,
        image: options.image,
        title: options.title,
        subtitle: options.subtitle,
        type: options.type,
    };
} 