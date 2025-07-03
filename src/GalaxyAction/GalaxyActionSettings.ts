import {
    Form,
    FormSectionElement,
    LabelRow,
    Section,
} from "@paperback/types";

// Main Settings Form
export class GalaxyActionSettingsForm extends Form {
    override getSections(): FormSectionElement[] {
        return [
            Section("mainSettings", [
                LabelRow("settingsLabel", {
                    title: "GalaxyAction Settings",
                    subtitle: "Configure your reading experience",
                }),
            ]),
        ];
    }
} 