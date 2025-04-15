import { ContentRating, SourceInfo, SourceIntents } from "@paperback/types";

export default {
    name: "ComicK",
    description: "Extension that pulls content from comick.io.",
    version: "1.0.0-alpha.8",
    icon: "icon.png",
    language: "en",
    contentRating: ContentRating.EVERYONE,
    capabilities: [
        SourceIntents.DISCOVER_SECIONS,
        SourceIntents.MANGA_CHAPTERS,
        SourceIntents.MANGA_SEARCH,
        SourceIntents.SETTINGS_UI,
    ],
    badges: [],
    developers: [
        {
            name: "Paperback Community",
            website: "https://github.com/paperback-community",
        },
    ],
} satisfies SourceInfo;
