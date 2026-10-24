import { relations } from "drizzle-orm/relations";
import { game, gameDeveloper, gamePublisher, gameMasterGenre, gameReleasePlatform, platform, platformAccount, emulator, backlogEntry, backlogDeveloperOverride, backlogPublisherOverride, backlogEntryGenre, genre, acquisition, subscription, tag, playthrough, device, inputMethod, coverImage } from "./schema";

export const gameDeveloperRelations = relations(gameDeveloper, ({one}) => ({
	game: one(game, {
		fields: [gameDeveloper.gameId],
		references: [game.id]
	}),
}));

export const gameRelations = relations(game, ({many}) => ({
	gameDevelopers: many(gameDeveloper),
	gamePublishers: many(gamePublisher),
	gameMasterGenres: many(gameMasterGenre),
	gameReleasePlatforms: many(gameReleasePlatform),
	backlogEntries: many(backlogEntry),
}));

export const gamePublisherRelations = relations(gamePublisher, ({one}) => ({
	game: one(game, {
		fields: [gamePublisher.gameId],
		references: [game.id]
	}),
}));

export const gameMasterGenreRelations = relations(gameMasterGenre, ({one}) => ({
	game: one(game, {
		fields: [gameMasterGenre.gameId],
		references: [game.id]
	}),
}));

export const gameReleasePlatformRelations = relations(gameReleasePlatform, ({one}) => ({
	game: one(game, {
		fields: [gameReleasePlatform.gameId],
		references: [game.id]
	}),
}));

export const platformAccountRelations = relations(platformAccount, ({one, many}) => ({
	platform: one(platform, {
		fields: [platformAccount.platformId],
		references: [platform.id]
	}),
	emulator: one(emulator, {
		fields: [platformAccount.emulatorId],
		references: [emulator.id]
	}),
	acquisitions: many(acquisition),
	playthroughs: many(playthrough),
}));

export const platformRelations = relations(platform, ({many}) => ({
	platformAccounts: many(platformAccount),
	acquisitions: many(acquisition),
	playthroughs: many(playthrough),
}));

export const emulatorRelations = relations(emulator, ({many}) => ({
	platformAccounts: many(platformAccount),
	playthroughs: many(playthrough),
}));

export const backlogDeveloperOverrideRelations = relations(backlogDeveloperOverride, ({one}) => ({
	backlogEntry: one(backlogEntry, {
		fields: [backlogDeveloperOverride.backlogEntryId],
		references: [backlogEntry.id]
	}),
}));

export const backlogEntryRelations = relations(backlogEntry, ({one, many}) => ({
	backlogDeveloperOverrides: many(backlogDeveloperOverride),
	backlogPublisherOverrides: many(backlogPublisherOverride),
	backlogEntryGenres: many(backlogEntryGenre),
	acquisitions: many(acquisition),
	game: one(game, {
		fields: [backlogEntry.gameId],
		references: [game.id]
	}),
	tag: one(tag, {
		fields: [backlogEntry.tagId],
		references: [tag.id]
	}),
	playthrough: one(playthrough, {
		fields: [backlogEntry.lastPlaythroughId],
		references: [playthrough.id],
		relationName: "backlogEntry_lastPlaythroughId_playthrough_id"
	}),
	playthroughs: many(playthrough, {
		relationName: "playthrough_backlogEntryId_backlogEntry_id"
	}),
	coverImages: many(coverImage),
}));

export const backlogPublisherOverrideRelations = relations(backlogPublisherOverride, ({one}) => ({
	backlogEntry: one(backlogEntry, {
		fields: [backlogPublisherOverride.backlogEntryId],
		references: [backlogEntry.id]
	}),
}));

export const backlogEntryGenreRelations = relations(backlogEntryGenre, ({one}) => ({
	backlogEntry: one(backlogEntry, {
		fields: [backlogEntryGenre.backlogEntryId],
		references: [backlogEntry.id]
	}),
	genre: one(genre, {
		fields: [backlogEntryGenre.genreId],
		references: [genre.id]
	}),
}));

export const genreRelations = relations(genre, ({many}) => ({
	backlogEntryGenres: many(backlogEntryGenre),
}));

export const acquisitionRelations = relations(acquisition, ({one}) => ({
	backlogEntry: one(backlogEntry, {
		fields: [acquisition.backlogEntryId],
		references: [backlogEntry.id]
	}),
	platform: one(platform, {
		fields: [acquisition.platformId],
		references: [platform.id]
	}),
	platformAccount: one(platformAccount, {
		fields: [acquisition.platformAccountId],
		references: [platformAccount.id]
	}),
	subscription: one(subscription, {
		fields: [acquisition.subscriptionId],
		references: [subscription.id]
	}),
}));

export const subscriptionRelations = relations(subscription, ({many}) => ({
	acquisitions: many(acquisition),
}));

export const tagRelations = relations(tag, ({many}) => ({
	backlogEntries: many(backlogEntry),
}));

export const playthroughRelations = relations(playthrough, ({one, many}) => ({
	backlogEntries: many(backlogEntry, {
		relationName: "backlogEntry_lastPlaythroughId_playthrough_id"
	}),
	backlogEntry: one(backlogEntry, {
		fields: [playthrough.backlogEntryId],
		references: [backlogEntry.id],
		relationName: "playthrough_backlogEntryId_backlogEntry_id"
	}),
	platformAccount: one(platformAccount, {
		fields: [playthrough.platformAccountId],
		references: [platformAccount.id]
	}),
	device: one(device, {
		fields: [playthrough.deviceId],
		references: [device.id]
	}),
	emulator: one(emulator, {
		fields: [playthrough.emulatorId],
		references: [emulator.id]
	}),
	inputMethod: one(inputMethod, {
		fields: [playthrough.inputMethodId],
		references: [inputMethod.id]
	}),
	platform: one(platform, {
		fields: [playthrough.platformId],
		references: [platform.id]
	}),
}));

export const deviceRelations = relations(device, ({many}) => ({
	playthroughs: many(playthrough),
}));

export const inputMethodRelations = relations(inputMethod, ({many}) => ({
	playthroughs: many(playthrough),
}));

export const coverImageRelations = relations(coverImage, ({one}) => ({
	backlogEntry: one(backlogEntry, {
		fields: [coverImage.backlogEntryId],
		references: [backlogEntry.id]
	}),
}));