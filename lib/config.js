import { migrateLegacyConversations, migrateMemoryFields, migrateTetheredFields, migrateParticipantsField, migrateUnreadCountField } from './storage.js';

export const MODULE_NAME = 'WeyPhone';

export const defaultSettings = Object.freeze({
    debug: false,
    connectionProfileId: '',
    modelId: '',
    conversations: {},
    phoneApps: {},
    housingRegistrarEnabled: false,
    bidirectionalTetheringEnabled: false,
});

/**
 * Returns the live WeyPhone settings object embedded in `extensionSettings`,
 * creating it (and backfilling any keys added to defaultSettings later) as needed.
 * Also migrates any milestone-1-era conversations (keyed by character name, no `id`) into the
 * current ID-keyed shape — see storage.js's migrateLegacyConversations for details.
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
    migrateLegacyConversations(settings);
    migrateMemoryFields(settings);
    migrateTetheredFields(settings);
    migrateParticipantsField(settings);
    migrateUnreadCountField(settings);
    return settings;
}
