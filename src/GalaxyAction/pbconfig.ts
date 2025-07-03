import { ContentRating, SourceInfo, SourceIntents } from "@paperback/types";

export default {
    name: "GalaxyAction",
    description: "Extension that pulls content from galaxyaction.net.",
    version: "1.0.0",
    icon: "icon.png",
    language: "en",
    contentRating: ContentRating.EVERYONE,
    capabilities: [
        SourceIntents.DISCOVER_SECIONS,
        SourceIntents.MANGA_SEARCH,
        SourceIntents.MANGA_CHAPTERS,
        SourceIntents.SETTINGS_UI,
    ],
    badges: [],
    developers: [
        {
            name: "SamipMainali",
        },
    ],
} satisfies SourceInfo; 