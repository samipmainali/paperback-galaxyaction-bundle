import {
    Chapter,
    ChapterDetails,
    ContentRating,
    DiscoverSectionItem,
    DiscoverSectionType,
    MangaInfo,
    SearchResultItem,
    SourceManga,
    TagSection,
} from "@paperback/types";
import { URLBuilder } from "../utils/url-builder/array-query-variant";
import { getLanguageName } from "./utils/language";

export const parseMangaDetails = (
    data: ComicK.MangaDetails,
    mangaId: string,
    apiUrl: string,
): SourceManga => {
    const { comic, authors, artists } = data;

    const titles: string[] = [
        comic.title,
        ...comic.md_titles.map((titleObj) => titleObj.title),
    ];

    const tagSections: TagSection[] = [];

    // Add tyoe tag section
    const countryTitle = parseComicType(comic.country);
    if (countryTitle) {
        tagSections.push(
            ...parseTags(
                [{ slug: comic.country, name: countryTitle }],
                "type",
                "Type",
            ),
        );
    }

    // Add genre tag section
    tagSections.push(
        ...parseTags(
            comic.md_comic_md_genres.map((item) => item.md_genres),
            "genres",
            "Genres",
        ),
    );

    const mangaInfo: MangaInfo = {
        thumbnailUrl: comic.cover_url,
        synopsis: comic.desc ? Application.decodeHTMLEntities(comic.desc) : "",
        primaryTitle: titles[0],
        secondaryTitles: titles,
        contentRating: parseContentRating(comic.content_rating),
        status: parseComicStatus(comic.status),
        author: authors.map((author: ComicK.Item) => author.name).join(","),
        artist: artists.map((artists: ComicK.Item) => artists.name).join(","),
        tagGroups: tagSections,
        shareUrl: new URLBuilder(apiUrl)
            .addPath("comic")
            .addPath(mangaId)
            .addQuery("tachiyomi", true)
            .build(),
    };

    return {
        mangaId,
        mangaInfo,
    };
};

export function parseChapters(
    data: ComicK.ChapterList,
    sourceManga: SourceManga,
    filter: ComicK.ChapterFilter,
): Chapter[] {
    const chaptersData = filterChapters(data.chapters, filter);

    return chaptersData.map((chapter) => {
        const chapNum = Number(chapter.chap);
        const volume = Number(chapter.vol);
        const groups = chapter.group_name ?? [];

        return {
            chapterId: chapter.hid,
            sourceManga,
            title: formatChapterTitle(chapter, filter.showTitle),
            chapNum,
            volume: filter.showVol && !isNaN(volume) ? volume : undefined,
            publishDate: new Date(chapter.created_at),
            version: groups.join(","),
            langCode: getLanguageName(chapter.lang),
        };
    });
}

export function parseChapterSinceDate(
    chapters: Chapter[],
    sinceDate?: Date,
): { hasNewChapters: boolean; parsedChapters: Chapter[] } {
    if (sinceDate && chapters.length > 0) {
        // Check the first chapter in the page since they're sorted newest first
        const firstChapter = chapters[0];
        if (
            firstChapter?.publishDate &&
            firstChapter.publishDate <= sinceDate
        ) {
            // If first chapter is older than sinceDate, filter and signal we're done
            return {
                hasNewChapters: false,
                parsedChapters: chapters.filter(
                    (c) => c.publishDate && c.publishDate > sinceDate,
                ),
            };
        }
    }

    // Either no sinceDate, or all chapters are newer
    return { hasNewChapters: true, parsedChapters: chapters };
}

export const parseChapterDetails = (
    data: ComicK.ChapterImages,
    chapter: Chapter,
): ChapterDetails => ({
    id: chapter.chapterId,
    mangaId: chapter.sourceManga.mangaId,
    pages: data.chapter.images
        .filter((image) => image.url)
        .map((image) => image.url),
});

export function parseTags(
    data: ComicK.Item[],
    sectionId: string,
    sectionTitle: string,
): TagSection[] {
    const tags = data
        .filter((tag) => tag.slug && tag.name)
        .map((tag) => ({
            id: tag.slug,
            title: tag.name,
        }));

    return [
        {
            id: sectionId,
            title: sectionTitle,
            tags,
        },
    ];
}

export function parseSearch(data: ComicK.SearchData[]): SearchResultItem[] {
    return data
        .filter((comic) => comic.hid)
        .map((comic) => ({
            imageUrl: comic.cover_url,
            title: Application.decodeHTMLEntities(comic.title),
            mangaId: comic.hid,
            subtitle: Application.decodeHTMLEntities(
                comic.last_chapter
                    ? `Chapter ${comic.last_chapter}`
                    : comic.title,
            ),
            contentRating: parseContentRating(comic.content_rating),
        }));
}

export function parseDiscoverSection(
    data: ComicK.SearchData[],
    type: DiscoverSectionType,
): DiscoverSectionItem[] {
    return data
        .filter((comic) => comic.hid)
        .map((comic) => {
            const baseItem = {
                imageUrl: comic.cover_url,
                title: Application.decodeHTMLEntities(comic.title),
                mangaId: comic.hid,
                contentRating: parseContentRating(comic.content_rating),
            };

            switch (type) {
                case DiscoverSectionType.featured:
                    return { ...baseItem, type: "featuredCarouselItem" };
                case DiscoverSectionType.prominentCarousel:
                    return { ...baseItem, type: "prominentCarouselItem" };
                case DiscoverSectionType.simpleCarousel:
                    return {
                        ...baseItem,
                        subtitle: Application.decodeHTMLEntities(
                            comic.last_chapter
                                ? `Chapter ${comic.last_chapter}`
                                : comic.title,
                        ),
                        type: "simpleCarouselItem",
                    };
                default:
                    throw new Error(`Unknown discover section type: ${type}`);
            }
        });
}

export function parseSortFilter() {
    return [
        { id: "follow", value: "Most follows" },
        { id: "view", value: "Most views" },
        { id: "rating", value: "High rating" },
        { id: "uploaded", value: "Last updated" },
    ];
}

export function parseDemographicFilters() {
    return [
        { id: "1", value: "Shonen" },
        { id: "2", value: "Shoujo" },
        { id: "3", value: "Seinen" },
        { id: "4", value: "Josei" },
    ];
}

export function parseTypeFilters() {
    return [
        { id: "user", value: "User" },
        { id: "author", value: "Author" },
        { id: "group", value: "Group" },
        { id: "comic", value: "Comic" },
    ];
}

export function parseCreatedAtFilters() {
    return [
        { id: "30", value: "30 days" },
        { id: "90", value: "3 months" },
        { id: "180", value: "6 months" },
        { id: "365", value: "1 year" },
    ];
}

export function parseComicTypeFilters() {
    return [
        { id: "kr", value: "Manhwa" },
        { id: "jp", value: "Manga" },
        { id: "cn", value: "Manhua" },
    ];
}

function parseContentRating(content_rating: string): ContentRating {
    if (content_rating === "erotica") {
        return ContentRating.ADULT;
    }

    if (content_rating === "suggestive") {
        return ContentRating.MATURE;
    }

    return ContentRating.EVERYONE;
}

function parseComicType(country: string): string | undefined {
    const comicTypeFilters = parseComicTypeFilters();
    return comicTypeFilters.find((filter) => filter.id === country)?.value;
}

function parseComicStatus(status: number): string {
    const comicStatusMap: Record<number, string> = {
        1: "ONGOING",
        2: "COMPLETED",
        3: "CANCELLED",
        4: "ON HIATUS",
    };

    return comicStatusMap[status] || "UNKNOWN";
}

function filterChapters(
    chapters: ComicK.ChapterData[],
    filter: ComicK.ChapterFilter,
): ComicK.ChapterData[] {
    if (filter.hideUnreleasedChapters) {
        const currentDate = new Date();
        chapters = chapters.filter(
            (chapter) => new Date(chapter.publish_at) <= currentDate,
        );
    }

    if (filter.chapterScoreFiltering) {
        return filterByScore(chapters);
    }

    if (filter.uploadersToggled && filter.uploaders.length) {
        return filterByUploaders(chapters, filter);
    }

    return chapters;
}

function filterByScore(chapters: ComicK.ChapterData[]): ComicK.ChapterData[] {
    const chapterMap = new Map<
        number,
        { score: number; chapter: ComicK.ChapterData }
    >();

    chapters.forEach((chapter) => {
        const chapNum = Number(chapter.chap);
        const score = chapter.up_count - chapter.down_count;
        const existing = chapterMap.get(chapNum);

        if (!existing || score > existing.score) {
            chapterMap.set(chapNum, { score, chapter });
        }
    });

    return Array.from(chapterMap.values()).map((v) => v.chapter);
}

function filterByUploaders(
    chapters: ComicK.ChapterData[],
    filter: ComicK.ChapterFilter,
): ComicK.ChapterData[] {
    const {
        uploaders,
        uploadersWhitelisted,
        aggressiveUploadersFilter,
        strictNameMatching,
    } = filter;

    return chapters.filter((chapter) => {
        const groups = chapter.group_name ?? [];
        const matchesUploader = (group: string, uploader: string) =>
            strictNameMatching
                ? uploader === group
                : group.toLowerCase().includes(uploader.toLowerCase());

        const hasMatchingUploader = groups.some((group) =>
            uploaders.some((uploader) => matchesUploader(group, uploader)),
        );

        const hasAllUploaders = groups.every((group) =>
            uploaders.some((uploader) => matchesUploader(group, uploader)),
        );

        if (aggressiveUploadersFilter) {
            return uploadersWhitelisted
                ? hasAllUploaders
                : !hasMatchingUploader;
        }

        return uploadersWhitelisted ? hasMatchingUploader : !hasAllUploaders;
    });
}

function formatChapterTitle(
    chapter: ComicK.ChapterData,
    showTitle: boolean,
): string {
    return showTitle && chapter.title ? `${chapter.title}` : "";
}
