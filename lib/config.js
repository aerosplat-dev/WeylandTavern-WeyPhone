export const MODULE_NAME = 'WeyPhone';

export const defaultSettings = Object.freeze({
    debug: false,
    connectionProfileId: '',
    conversations: {},
});

/**
 * Returns the live WeyPhone settings object embedded in `extensionSettings`,
 * creating it (and backfilling any keys added to defaultSettings later) as needed.
 * @param {Record<string, any>} extensionSettings SillyTavern's context.extensionSettings
 */
export function getSettings(extensionSettings) {
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    const settings = extensionSettings[MODULE_NAME];
    for (const key of Object.keys(defaultSettings)) {
        if (!(key in settings)) {
            settings[key] = structuredClone(defaultSettings[key]);
        }
    }
    return settings;
}
