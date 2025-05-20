import {
    Chapter,
    ChapterDetails,
    ChapterProviding,
    ChapterReadActionQueueProcessingResult,
    DiscoverSection,
    DiscoverSectionItem,
    DiscoverSectionProviding,
    Extension,
    Form,
    LibraryItemSourceLinkProposal,
    ManagedCollection,
    ManagedCollectionChangeset,
    ManagedCollectionProviding,
    MangaProgress,
    MangaProgressProviding,
    MangaProviding,
    PagedResults,
    SearchFilter,
    SearchQuery,
    SearchResultItem,
    SearchResultsProviding,
    SettingsFormProviding,
    SortingOption,
    SourceManga,
    TagSection,
    TrackedMangaChapterReadAction,
    UpdateManager,
} from "@paperback/types";
import { MangaDexInterceptor } from "./MangaDexInterceptor";
import { ChapterProvider } from "./providers/ChapterProvider";
import { CollectionProvider } from "./providers/CollectionProvider";
import { DiscoverProvider } from "./providers/DiscoverProvider";
import { MangaProvider } from "./providers/MangaProvider";
import { ProgressProvider } from "./providers/ProgressProvider";
import { SearchProvider } from "./providers/SearchProvider";
import { SettingsProvider } from "./providers/SettingsProvider";
import { BasicRateLimiter } from "./utils/BasicRateLimiter";

/**
 * Interface defining all the capabilities this extension implements
 */
type MangaDexImplementation = Extension &
    SearchResultsProviding &
    MangaProviding &
    ChapterProviding &
    SettingsFormProviding &
    ManagedCollectionProviding &
    MangaProgressProviding &
    DiscoverSectionProviding;

/**
 * Main extension class that implements all MangaDex functionality
 * Acts as an entry to the individual provider services
 */
export class MangaDexExtension implements MangaDexImplementation {
    // Rate limiting and request interception
    globalRateLimiter = new BasicRateLimiter("rateLimiter", {
        numberOfRequests: 5,
        bufferInterval: 1,
        ignoreImages: true,
    });
    mainRequestInterceptor = new MangaDexInterceptor("main");

    // Provider instances for different functions of the extension
    private mangaProvider: MangaProvider = new MangaProvider();
    private chapterProvider: ChapterProvider = new ChapterProvider(
        this.mangaProvider,
    );
    private searchProvider: SearchProvider = new SearchProvider();
    private discoverProvider: DiscoverProvider = new DiscoverProvider();
    private collectionProvider: CollectionProvider = new CollectionProvider();
    private progressProvider: ProgressProvider = new ProgressProvider(
        this.chapterProvider,
    );
    private settingsProvider: SettingsProvider = new SettingsProvider();

    async initialise(): Promise<void> {
        this.globalRateLimiter.registerInterceptor();
        this.mainRequestInterceptor.registerInterceptor();

        if (Application.isResourceLimited) return;
    }

    // MangaProviding implementation
    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        return this.mangaProvider.getMangaDetails(mangaId);
    }

    // SearchResultsProviding implementation
    async getSearchFilters(): Promise<SearchFilter[]> {
        return this.searchProvider.getSearchFilters();
    }

    async getSearchResults(
        query: SearchQuery,
        metadata: MangaDex.Metadata,
        sortingOption: SortingOption | undefined,
    ): Promise<PagedResults<SearchResultItem>> {
        return this.searchProvider.getSearchResults(
            query,
            metadata,
            sortingOption,
        );
    }

    getSearchTags(): TagSection[] {
        return this.searchProvider.getSearchTags();
    }

    async getSortingOptions(): Promise<SortingOption[]> {
        return this.searchProvider.getSortingOptions();
    }

    // ChapterProviding implementation
    async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
        return this.chapterProvider.getChapters(sourceManga);
    }

    async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
        return this.chapterProvider.getChapterDetails(chapter);
    }

    async processTitlesForUpdates(updateManager: UpdateManager): Promise<void> {
        return this.chapterProvider.processTitlesForUpdates(updateManager);
    }

    // SettingsFormProviding implementation
    async getSettingsForm(): Promise<Form> {
        return this.settingsProvider.getSettingsForm();
    }

    // ManagedCollectionProviding implementation
    async prepareLibraryItems(): Promise<LibraryItemSourceLinkProposal[]> {
        return this.collectionProvider.prepareLibraryItems();
    }

    async getManagedLibraryCollections(): Promise<ManagedCollection[]> {
        return this.collectionProvider.getManagedLibraryCollections();
    }

    async commitManagedCollectionChanges(
        changeset: ManagedCollectionChangeset,
    ): Promise<void> {
        return this.collectionProvider.commitManagedCollectionChanges(
            changeset,
        );
    }

    async getSourceMangaInManagedCollection(
        managedCollection: ManagedCollection,
    ): Promise<SourceManga[]> {
        return this.collectionProvider.getSourceMangaInManagedCollection(
            managedCollection,
        );
    }

    // MangaProgressProviding implementation
    async getMangaProgressManagementForm(
        sourceManga: SourceManga,
    ): Promise<Form> {
        return this.progressProvider.getMangaProgressManagementForm(
            sourceManga,
        );
    }

    async getMangaProgress(
        sourceManga: SourceManga,
    ): Promise<MangaProgress | undefined> {
        return this.progressProvider.getMangaProgress(sourceManga);
    }

    async processChapterReadActionQueue(
        actions: TrackedMangaChapterReadAction[],
    ): Promise<ChapterReadActionQueueProcessingResult> {
        return this.progressProvider.processChapterReadActionQueue(actions);
    }

    // DiscoverSectionProviding implementation
    async getDiscoverSections(): Promise<DiscoverSection[]> {
        return this.discoverProvider.getDiscoverSections();
    }

    async getDiscoverSectionItems(
        section: DiscoverSection,
        metadata: MangaDex.Metadata | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        return this.discoverProvider.getDiscoverSectionItems(section, metadata);
    }
}

export const MangaDex = new MangaDexExtension();
