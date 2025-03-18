import {
    BasicRateLimiter,
    Chapter,
    ChapterDetails,
    ChapterProviding,
    DiscoverSection,
    DiscoverSectionItem,
    DiscoverSectionType,
    Extension,
    Form,
    LibraryItemSourceLinkProposal,
    ManagedCollection,
    ManagedCollectionChangeset,
    ManagedCollectionProviding,
    MangaProviding,
    PagedResults,
    PaperbackInterceptor,
    Request,
    Response,
    SearchFilter,
    SearchQuery,
    SearchResultItem,
    SearchResultsProviding,
    SettingsFormProviding,
    SourceManga,
    TagSection,
} from "@paperback/types";
import { URLBuilder } from "../utils/url-builder/base";
import tagJSON from "./external/tag.json";
import { MDLanguages } from "./MangaDexHelper";
import {
    parseChapterTitle,
    parseMangaDetails,
    parseMangaList,
} from "./MangaDexParser";
import {
    getAccessToken,
    getBlockedGroups,
    getDataSaver,
    getForcePort443,
    getGroupBlockingEnabled,
    getHomepageThumbnail,
    getLanguages,
    getRatings,
    getSearchThumbnail,
    getSkipSameChapter,
    MangaDexSettingsForm,
    saveAccessToken,
} from "./MangaDexSettings";

const MANGADEX_DOMAIN = "https://mangadex.org";
const MANGADEX_API = "https://api.mangadex.org";
const COVER_BASE_URL = "https://uploads.mangadex.org/covers";

const SEASONAL_LIST = "77430796-6625-4684-b673-ffae5140f337";

type MangaDexImplementation = Extension &
    SearchResultsProviding &
    MangaProviding &
    ChapterProviding &
    SettingsFormProviding &
    ManagedCollectionProviding;
class MangaDexInterceptor extends PaperbackInterceptor {
    private readonly imageRegex = new RegExp(
        /\.(png|gif|jpeg|jpg|webp)(\?|$)/gi,
    );

    override async interceptRequest(request: Request): Promise<Request> {
        // Impossible to have undefined headers, ensured by the app
        request.headers = {
            ...request.headers,
            referer: `${MANGADEX_DOMAIN}/`,
        };

        let accessToken = getAccessToken();
        if (
            this.imageRegex.test(request.url) ||
            request.url.includes("auth/") ||
            request.url.includes("auth.mangadex") ||
            !accessToken
        ) {
            return request;
        }
        // Padding 60 secs to make sure it wont expire in-transit if the connection is really bad

        if (Number(accessToken.tokenBody.exp) <= Date.now() / 1000 - 60) {
            try {
                const [response, buffer] = await Application.scheduleRequest({
                    url: "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token",
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: {
                        grant_type: "refresh_token",
                        refresh_token: accessToken.refreshToken,
                        client_id: "paperback",
                    },
                });

                if (response.status > 399) {
                    return request;
                }

                const data = Application.arrayBufferToUTF8String(buffer);
                const json = JSON.parse(data) as
                    | MangaDex.AuthResponse
                    | MangaDex.AuthError;

                if ("error" in json) {
                    return request;
                }
                accessToken = saveAccessToken(
                    json.access_token,
                    json.refresh_token,
                );
                if (!accessToken) {
                    return request;
                }
            } catch {
                return request;
            }
        }

        // Impossible to have undefined headers, ensured by the app
        request.headers = {
            ...request.headers,
            Authorization: "Bearer " + accessToken.accessToken,
        };
        return request;
    }

    override async interceptResponse(
        request: Request,
        response: Response,
        data: ArrayBuffer,
    ): Promise<ArrayBuffer> {
        return data;
    }
}

export class MangaDexExtension implements MangaDexImplementation {
    globalRateLimiter = new BasicRateLimiter("rateLimiter", {
        numberOfRequests: 4,
        bufferInterval: 1,
        ignoreImages: true,
    });
    mainRequestInterceptor = new MangaDexInterceptor("main");

    async initialise(): Promise<void> {
        this.globalRateLimiter.registerInterceptor();
        this.mainRequestInterceptor.registerInterceptor();

        if (Application.isResourceLimited) return;
    }

    async getDiscoverSections(): Promise<DiscoverSection[]> {
        return [
            {
                id: "seasonal",
                title: "Seasonal",
                type: DiscoverSectionType.featured,
            },
            {
                id: "latest_updates",
                title: "Latest Updates",
                type: DiscoverSectionType.chapterUpdates,
            },
            {
                id: "popular",
                title: "Popular",
                type: DiscoverSectionType.prominentCarousel,
            },
            {
                id: "recently_Added",
                title: "Recently Added",
                type: DiscoverSectionType.simpleCarousel,
            },
            ...this.getTagSections(),
        ];
    }

    async getDiscoverSectionItems(
        section: DiscoverSection,
        metadata: MangaDex.Metadata | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        switch (section.id) {
            case "seasonal":
                return this.getMangaListDiscoverSectionItems(section);
            case "latest_updates":
                return this.getLatestUpdatesDiscoverSectionItems(
                    section,
                    metadata,
                );
            case "popular":
                return this.getPopularDiscoverSectionItems(section, metadata);
            case "recently_Added":
                return this.getRecentlyAddedDiscoverSectionItems(
                    section,
                    metadata,
                );
            default:
                return this.getTags(section);
        }
    }

    getTagSections(): DiscoverSection[] {
        const uniqueGroups = new Set<string>();
        const sections: DiscoverSection[] = [];

        for (const tag of tagJSON) {
            const group = tag.data.attributes.group;

            if (!uniqueGroups.has(group)) {
                uniqueGroups.add(group);
                sections.push({
                    id: group,
                    title: group.charAt(0).toUpperCase() + group.slice(1),
                    type: DiscoverSectionType.genres,
                });
            }
        }

        return sections;
    }

    async getTags(
        section: DiscoverSection,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        const sections: Record<string, TagSection> = {};

        for (const tag of tagJSON) {
            const group = tag.data.attributes.group;

            if (sections[group] == null) {
                sections[group] = {
                    id: group,
                    title: group.charAt(0).toUpperCase() + group.slice(1),
                    tags: [],
                };
            }

            const tagObject = {
                id: tag.data.id,
                title: tag.data.attributes.name.en,
            };
            sections[group].tags = [
                ...(sections[group]?.tags ?? []),
                tagObject,
            ];
        }

        return {
            items:
                sections[section.id]?.tags.map((x) => ({
                    type: "genresCarouselItem",
                    searchQuery: {
                        title: "",
                        filters: [
                            {
                                id: `tags-${section.id}`,
                                value: { [x.id]: "included" },
                            },
                        ],
                    },
                    name: x.title,
                })) ?? [],
            metadata: undefined,
        };
    }

    // This will be called for manga that have many new chapters which could not all be fetched in the
    // above method, aka 'high' priority titles
    async getNewChapters(sourceManga: SourceManga): Promise<Chapter[]> {
        return this.getChapters(sourceManga);
    }

    async getSettingsForm(): Promise<Form> {
        return new MangaDexSettingsForm();
    }

    getSearchTags(): TagSection[] {
        const sections: Record<string, TagSection> = {};

        for (const tag of tagJSON) {
            const group = tag.data.attributes.group;

            if (sections[group] == null) {
                sections[group] = {
                    id: group,
                    title: group.charAt(0).toUpperCase() + group.slice(1),
                    tags: [],
                };
            }

            const tagObject = {
                id: tag.data.id,
                title: tag.data.attributes.name.en,
            };
            sections[group].tags = [
                ...(sections[group]?.tags ?? []),
                tagObject,
            ];
        }

        return Object.values(sections);
    }

    // Used for seasonal listing
    async getCustomListRequestURL(
        listId: string,
        ratings: string[],
    ): Promise<string> {
        const request = {
            url: `${MANGADEX_API}/list/${listId}`,
            method: "GET",
        };

        const json = await this.fetchJSON<MangaDex.CustomListResponse>(request);

        return new URLBuilder(MANGADEX_API)
            .addPath("manga")
            .addQuery("limit", 100)
            .addQuery("contentRating", ratings)
            .addQuery("includes", ["cover_art"])
            .addQuery(
                "ids",
                json.data.relationships
                    .filter(
                        (x: MangaDex.Relationship) =>
                            x.type.valueOf() === "manga",
                    )
                    .map((x: MangaDex.Relationship) => x.id),
            )
            .build();
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        this.checkId(mangaId);

        let request = {
            url: new URLBuilder(MANGADEX_API)
                .addPath("manga")
                .addPath(mangaId)
                .addQuery("includes", ["author", "artist", "cover_art"])
                .build(),
            method: "GET",
        };

        const json =
            await this.fetchJSON<MangaDex.MangaDetailsResponse>(request);

        request = {
            url: new URLBuilder(MANGADEX_API)
                .addPath("statistics")
                .addPath("manga")
                .addPath(mangaId)
                .build(),
            method: "GET",
        };

        const ratingJson =
            await this.fetchJSON<MangaDex.StatisticsResponse>(request);
        return parseMangaDetails(mangaId, COVER_BASE_URL, json, ratingJson);
    }

    async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
        const mangaId = sourceManga.mangaId;
        this.checkId(mangaId);

        const languages: string[] = getLanguages();
        const skipSameChapter = getSkipSameChapter();
        const ratings: string[] = getRatings();
        const groupBlockingEnabled = getGroupBlockingEnabled();
        const blockedGroups = groupBlockingEnabled
            ? Object.keys(getBlockedGroups() || {})
            : [];
        const collectedChapters = new Set<string>();
        const chapters: Chapter[] = [];

        let offset = 0;
        let sortingIndex = 0;

        let hasResults = true;
        while (hasResults) {
            const request = {
                url: new URLBuilder(MANGADEX_API)
                    .addPath("manga")
                    .addPath(mangaId)
                    .addPath("feed")
                    .addQuery("limit", 500)
                    .addQuery("offset", offset)
                    .addQuery("includes", ["scanlation_group"])
                    .addQuery(
                        "excludedGroups",
                        blockedGroups.length > 0 ? blockedGroups : [],
                    )
                    .addQuery("translatedLanguage", languages)
                    .addQuery("order", {
                        volume: "desc",
                        chapter: "desc",
                        publishAt: "desc",
                    })
                    .addQuery("contentRating", ratings)
                    .addQuery("includeFutureUpdates", "0")
                    .build(),
                method: "GET",
            };

            const json =
                await this.fetchJSON<MangaDex.ChapterResponse>(request);

            offset += 500;

            if (json.data === undefined)
                throw new Error(`Failed to create chapters for ${mangaId}`);

            for (const chapter of json.data) {
                const chapterId = chapter.id;
                const chapterDetails = chapter.attributes;
                const name =
                    Application.decodeHTMLEntities(
                        chapterDetails.title ?? "",
                    ) ?? "";
                const chapNum = Number(chapterDetails.chapter);
                const volume = Number(chapterDetails.volume);
                const langCode = MDLanguages.getFlagCode(
                    chapterDetails.translatedLanguage,
                );
                const time = new Date(chapterDetails.publishAt);
                const group = chapter.relationships
                    .filter(
                        (x: MangaDex.ChapterRelationship) =>
                            x.type.valueOf() === "scanlation_group",
                    )
                    .map(
                        (x: MangaDex.ChapterRelationship) => x.attributes?.name,
                    )
                    .join(", ");
                const pages = Number(chapterDetails.pages);
                const identifier = `${volume}-${chapNum}-${chapterDetails.translatedLanguage}`;

                if (collectedChapters.has(identifier) && skipSameChapter)
                    continue;

                if (pages > 0) {
                    chapters.push({
                        chapterId,
                        sourceManga,
                        title: name,
                        chapNum,
                        volume,
                        langCode,
                        version: group,
                        publishDate: time,
                        sortingIndex,
                    });
                    collectedChapters.add(identifier);
                    sortingIndex--;
                }
            }

            if (json.total <= offset) {
                hasResults = false;
            }
        }

        if (chapters.length == 0) {
            throw new Error(
                `Couldn't find any chapters in your selected language for mangaId: ${mangaId}!`,
            );
        }

        return chapters.map((chapter) => {
            chapter.sortingIndex =
                (chapter.sortingIndex ?? 0) + chapters.length;
            return chapter;
        });
    }

    async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
        const chapterId = chapter.chapterId;
        const mangaId = chapter.sourceManga.mangaId;

        this.checkId(chapterId); // Check the the mangaId is an old id

        const dataSaver = getDataSaver();
        const forcePort = getForcePort443();

        const request = {
            url: `${MANGADEX_API}/at-home/server/${chapterId}${forcePort ? "?forcePort443=true" : ""}`,
            method: "GET",
        };

        const json =
            await this.fetchJSON<MangaDex.ChapterDetailsResponse>(request);
        const serverUrl = json.baseUrl;
        const chapterDetails = json.chapter;

        let pages: string[];
        if (dataSaver) {
            pages = chapterDetails.dataSaver.map(
                (x: string) =>
                    `${serverUrl}/data-saver/${chapterDetails.hash}/${x}`,
            );
        } else {
            pages = chapterDetails.data.map(
                (x: string) => `${serverUrl}/data/${chapterDetails.hash}/${x}`,
            );
        }

        return { id: chapterId, mangaId: mangaId, pages };
    }

    async getSearchFilters(): Promise<SearchFilter[]> {
        const filters: SearchFilter[] = [];

        filters.push({
            id: "includeOperator",
            type: "dropdown",
            options: [
                { id: "AND", value: "AND" },
                { id: "OR", value: "OR" },
            ],
            value: "AND",
            title: "Include Operator",
        });

        filters.push({
            id: "excludeOperator",
            type: "dropdown",
            options: [
                { id: "AND", value: "AND" },
                { id: "OR", value: "OR" },
            ],
            value: "OR",
            title: "Exclude Operator",
        });

        const tags = this.getSearchTags();
        for (const tag of tags) {
            filters.push({
                type: "multiselect",
                options: tag.tags.map((x) => ({ id: x.id, value: x.title })),
                id: "tags-" + tag.id,
                allowExclusion: true,
                title: tag.title,
                value: {},
                allowEmptySelection: true,
                maximum: undefined,
            });
        }

        return filters;
    }

    async getSearchResults(
        query: SearchQuery,
        metadata: MangaDex.Metadata,
    ): Promise<PagedResults<SearchResultItem>> {
        const ratings: string[] = getRatings();
        const languages: string[] = getLanguages();
        const offset: number = metadata?.offset ?? 0;
        let results: SearchResultItem[] = [];

        const searchType = query.title?.match(
            /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
        )
            ? "ids[]"
            : "title";
        const url = new URLBuilder(MANGADEX_API)
            .addPath("manga")
            .addQuery(searchType, query?.title?.replace(/ /g, "+") || "")
            .addQuery("limit", 100)
            .addQuery("hasAvailableChapters", true)
            .addQuery("availableTranslatedLanguage", languages)
            .addQuery("offset", offset)
            .addQuery("contentRating", ratings)
            .addQuery("includes", ["cover_art"]);

        const includedTags = [];
        const excludedTags = [];
        for (const filter of query.filters) {
            if (filter.id.startsWith("tags")) {
                const tags = (filter.value ?? {}) as Record<
                    string,
                    "included" | "excluded"
                >;
                for (const tag of Object.entries(tags)) {
                    switch (tag[1]) {
                        case "excluded":
                            excludedTags.push(tag[0]);
                            break;
                        case "included":
                            includedTags.push(tag[0]);
                            break;
                    }
                }
            }

            if (filter.id == "includeOperator") {
                url.addQuery("includedTagsMode", filter.value ?? "and");
            }

            if (filter.id == "excludeOperator") {
                url.addQuery("excludedTagsMode", filter.value ?? "or");
            }
        }

        const request = {
            url: url
                .addQuery("includedTags", includedTags)
                .addQuery("excludedTags", excludedTags)
                .build(),
            method: "GET",
        };
        const json = await this.fetchJSON<MangaDex.SearchResponse>(request);
        if (json.data === undefined) {
            throw new Error(
                `Failed to create search results, check MangaDex status and your search query`,
            );
        }

        results = await parseMangaList(
            json.data,
            COVER_BASE_URL,
            getSearchThumbnail,
            query,
        );
        const nextMetadata: MangaDex.Metadata | undefined =
            results.length < 100 ? undefined : { offset: offset + 100 };

        return { items: results, metadata: nextMetadata };
    }

    async getMangaListDiscoverSectionItems(
        section: DiscoverSection,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        const ratings: string[] = getRatings();

        const request = {
            url: await this.getCustomListRequestURL(SEASONAL_LIST, ratings),
            method: "GET",
        };
        const json = await this.fetchJSON<MangaDex.SearchResponse>(request);
        if (json.data === undefined) {
            throw new Error(
                `Failed to create results for ${section.title}, check MangaDex status`,
            );
        }

        const items = await parseMangaList(
            json.data,
            COVER_BASE_URL,
            getHomepageThumbnail,
        );

        return {
            items: items.map((x) => ({
                type: "featuredCarouselItem",
                imageUrl: x.imageUrl,
                mangaId: x.mangaId,
                title: x.title,
                supertitle: undefined,
                metadata: undefined,
            })),
            metadata: undefined,
        };
    }

    async getPopularDiscoverSectionItems(
        section: DiscoverSection,
        metadata: MangaDex.Metadata | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        const offset: number = metadata?.offset ?? 0;
        const collectedIds: string[] = metadata?.collectedIds ?? [];

        const ratings: string[] = getRatings();
        const languages: string[] = getLanguages();

        const request = {
            url: new URLBuilder(MANGADEX_API)
                .addPath("manga")
                .addQuery("limit", 100)
                .addQuery("hasAvailableChapters", true)
                .addQuery("availableTranslatedLanguage", languages)
                .addQuery("order", { followedCount: "desc" })
                .addQuery("offset", offset)
                .addQuery("contentRating", ratings)
                .addQuery("includes", ["cover_art"])
                .build(),
            method: "GET",
        };
        const json = await this.fetchJSON<MangaDex.SearchResponse>(request);
        if (json.data === undefined) {
            throw new Error(
                `Failed to create results for ${section.title}, check MangaDex status`,
            );
        }

        const items = await parseMangaList(
            json.data,
            COVER_BASE_URL,
            getHomepageThumbnail,
        );
        const nextMetadata: MangaDex.Metadata | undefined =
            items.length < 100
                ? undefined
                : { offset: offset + 100, collectedIds };
        return {
            items: items.map((x) => ({ ...x, type: "prominentCarouselItem" })),
            metadata: nextMetadata,
        };
    }

    async getLatestUpdatesDiscoverSectionItems(
        section: DiscoverSection,
        metadata: MangaDex.Metadata | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        const offset: number = metadata?.offset ?? 0;
        const collectedIds: string[] = metadata?.collectedIds ?? [];

        const ratings: string[] = getRatings();
        const languages: string[] = getLanguages();

        let request = {
            url: new URLBuilder(MANGADEX_API)
                .addPath("manga")
                .addQuery("limit", 100)
                .addQuery("hasAvailableChapters", true)
                .addQuery("availableTranslatedLanguage", languages)
                .addQuery("order", { latestUploadedChapter: "desc" })
                .addQuery("offset", offset)
                .addQuery("contentRating", ratings)
                .addQuery("includes", ["cover_art"])
                .build(),
            method: "GET",
        };
        const json = await this.fetchJSON<MangaDex.SearchResponse>(request);
        if (json.data === undefined) {
            throw new Error(
                `Failed to create results for ${section.title}, check MangaDex status`,
            );
        }

        const items = await parseMangaList(
            json.data,
            COVER_BASE_URL,
            getHomepageThumbnail,
        );

        request = {
            url: new URLBuilder(MANGADEX_API)
                .addPath("chapter")
                .addQuery("limit", 100)
                .addQuery(
                    "ids",
                    json.data.map((x) => x.attributes.latestUploadedChapter),
                )
                .build(),
            method: "GET",
        };
        const chapters =
            await this.fetchJSON<MangaDex.ChapterResponse>(request);

        const chapterIdToChapter: Record<string, MangaDex.ChapterData> = {};
        for (const chapter of chapters.data) {
            chapterIdToChapter[chapter.id] = chapter;
        }

        const nextMetadata: MangaDex.Metadata | undefined =
            items.length < 100
                ? undefined
                : { offset: offset + 100, collectedIds };
        return {
            items: items.map((x) => ({
                chapterId: x.attributes.latestUploadedChapter,
                imageUrl: x.imageUrl,
                mangaId: x.mangaId,
                title: x.title,
                subtitle: parseChapterTitle(
                    chapterIdToChapter[x.attributes.latestUploadedChapter]
                        ?.attributes ?? {},
                ),
                publishDate: new Date(
                    chapterIdToChapter[
                        x.attributes.latestUploadedChapter
                    ]?.attributes.readableAt,
                ),
                type: "chapterUpdatesCarouselItem",
            })),
            metadata: nextMetadata,
        };
    }

    async getRecentlyAddedDiscoverSectionItems(
        section: DiscoverSection,
        metadata: MangaDex.Metadata | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        const offset: number = metadata?.offset ?? 0;
        const collectedIds: string[] = metadata?.collectedIds ?? [];

        const ratings: string[] = getRatings();
        const languages: string[] = getLanguages();

        const request = {
            url: new URLBuilder(MANGADEX_API)
                .addPath("manga")
                .addQuery("limit", 100)
                .addQuery("hasAvailableChapters", true)
                .addQuery("availableTranslatedLanguage", languages)
                .addQuery("order", { createdAt: "desc" })
                .addQuery("offset", offset)
                .addQuery("contentRating", ratings)
                .addQuery("includes", ["cover_art"])
                .build(),
            method: "GET",
        };
        const json = await this.fetchJSON<MangaDex.SearchResponse>(request);
        if (json.data === undefined) {
            throw new Error(
                `Failed to create results for ${section.title}, check MangaDex status`,
            );
        }

        const items = await parseMangaList(
            json.data,
            COVER_BASE_URL,
            getHomepageThumbnail,
        );
        const nextMetadata: MangaDex.Metadata | undefined =
            items.length < 100
                ? undefined
                : { offset: offset + 100, collectedIds };
        return {
            items: items.map((x) => ({ ...x, type: "simpleCarouselItem" })),
            metadata: nextMetadata,
        };
    }

    async prepareLibraryItems(): Promise<LibraryItemSourceLinkProposal[]> {
        throw new Error("Method not implemented.");
    }

    async getManagedLibraryCollections(): Promise<ManagedCollection[]> {
        return [
            { id: "reading", title: "Reading" },
            { id: "plan_to_read", title: "Planned" },
            { id: "completed", title: "Completed" },
            { id: "dropped", title: "Dropped" },
        ];
    }

    async commitManagedCollectionChanges(
        changeset: ManagedCollectionChangeset,
    ): Promise<void> {
        if (!getAccessToken()) {
            throw new Error("You need to be logged in");
        }

        for (const addition of changeset.additions) {
            await Application.scheduleRequest({
                url: new URLBuilder(MANGADEX_API)
                    .addPath("manga")
                    .addPath(addition.mangaId)
                    .addPath("status")
                    .build(),
                method: "post",
                headers: { "Content-Type": "application/json" },
                body: { status: changeset.collection.id },
            });
        }

        for (const deletion of changeset.deletions) {
            await Application.scheduleRequest({
                url: new URLBuilder(MANGADEX_API)
                    .addPath("manga")
                    .addPath(deletion.mangaId)
                    .addPath("status")
                    .build(),
                method: "post",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: null }),
            });
        }
    }

    async getSourceMangaInManagedCollection(
        managedCollection: ManagedCollection,
    ): Promise<SourceManga[]> {
        if (!getAccessToken()) {
            throw new Error("You need to be logged in");
        }

        const [_, buffer] = await Application.scheduleRequest({
            url: new URLBuilder(MANGADEX_API)
                .addPath("manga")
                .addPath("status")
                .build(),
            method: "get",
        });

        const statusjson = JSON.parse(
            Application.arrayBufferToUTF8String(buffer),
        ) as MangaDex.MangaStatusResponse;

        if (statusjson.result === "error") {
            throw new Error(JSON.stringify(statusjson.errors)); // Assuming the API has it even if not listed
        }

        const ids = Object.keys(statusjson.statuses).filter(
            (x) => statusjson.statuses[x] === managedCollection.id,
        );

        let hasResults = true;
        let offset = 0;
        const limit = 100;
        const items: SourceManga[] = [];

        while (hasResults) {
            const batch = ids.slice(offset, offset + limit);

            const [_, buffer] = await Application.scheduleRequest({
                url: new URLBuilder(MANGADEX_API)
                    .addPath("manga")
                    .addQuery("ids", batch)
                    .addQuery("includes", ["author", "artist", "cover_art"])
                    .addQuery("contentRating", [
                        "safe",
                        "suggestive",
                        "erotica",
                        "pornographic",
                    ])
                    .addQuery("limit", limit)
                    .build(),
                method: "get",
            });

            const json = JSON.parse(
                Application.arrayBufferToUTF8String(buffer),
            ) as MangaDex.SearchResponse;

            if (json.result === "error") {
                throw new Error(JSON.stringify(json.errors));
            }

            for (const item of json.data) {
                items.push(
                    parseMangaDetails(item.id, COVER_BASE_URL, {
                        result: "ok",
                        response: "entity",
                        data: item,
                    } as MangaDex.MangaDetailsResponse),
                );
            }

            hasResults = batch.length >= limit;
            offset += batch.length;
        }

        return items;
    }

    checkId(id: string): void {
        if (!id.includes("-")) {
            throw new Error(
                "OLD ID: PLEASE REFRESH AND CLEAR ORPHANED CHAPTERS",
            );
        }
    }

    async fetchJSON<T>(request: Request): Promise<T> {
        const [response, buffer] = await Application.scheduleRequest(request);
        const data = Application.arrayBufferToUTF8String(buffer);
        const json: T =
            typeof data === "string" ? (JSON.parse(data) as T) : (data as T);
        if (response.status !== 200) {
            throw new Error(`Failed to fetch json results for ${request.url}`);
        }
        return json;
    }
}

export const MangaDex = new MangaDexExtension();
