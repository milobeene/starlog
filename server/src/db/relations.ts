import { relations } from "drizzle-orm/relations";
import { member, authToken, game, gameDeveloper, gamePublisher, gameMasterGenre, gameReleasePlatform, platform, device, emulator, inputMethod, platformAccount, subscription, genre, tag, backlogEntry, backlogDeveloperOverride, backlogPublisherOverride, backlogEntryGenre, acquisition, playthrough, coverImage } from "./schema";

export const authTokenRelations = relations(authToken, ({one}) => ({
	member: one(member, {
		fields: [authToken.memberId],
		references: [member.id]
	}),
}));

export const memberRelations = relations(member, ({many}) => ({
	authTokens: many(authToken),
	platforms: many(platform),
	devices: many(device),
	emulators: many(emulator),
	inputMethods: many(inputMethod),
	platformAccounts: many(platformAccount),
	subscriptions: many(subscription),
	genres: many(genre),
	tags: many(tag),
	backlogEntries: many(backlogEntry),
}));

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

export const platformRelations = relations(platform, ({one, many}) => ({
	member: one(member, {
		fields: [platform.memberId],
		references: [member.id]
	}),
	platformAccounts: many(platformAccount),
	acquisitions: many(acquisition),
	playthroughs: many(playthrough),
}));

export const deviceRelations = relations(device, ({one, many}) => ({
	member: one(member, {
		fields: [device.memberId],
		references: [member.id]
	}),
	playthroughs: many(playthrough),
}));

export const emulatorRelations = relations(emulator, ({one, many}) => ({
	member: one(member, {
		fields: [emulator.memberId],
		references: [member.id]
	}),
	platformAccounts: many(platformAccount),
	playthroughs: many(playthrough),
}));

export const inputMethodRelations = relations(inputMethod, ({one, many}) => ({
	member: one(member, {
		fields: [inputMethod.memberId],
		references: [member.id]
	}),
	playthroughs: many(playthrough),
}));

export const platformAccountRelations = relations(platformAccount, ({one, many}) => ({
	member: one(member, {
		fields: [platformAccount.memberId],
		references: [member.id]
	}),
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

export const subscriptionRelations = relations(subscription, ({one, many}) => ({
	member: one(member, {
		fields: [subscription.memberId],
		references: [member.id]
	}),
	acquisitions: many(acquisition),
}));

export const genreRelations = relations(genre, ({one, many}) => ({
	member: one(member, {
		fields: [genre.memberId],
		references: [member.id]
	}),
	backlogEntryGenres: many(backlogEntryGenre),
}));

export const tagRelations = relations(tag, ({one, many}) => ({
	member: one(member, {
		fields: [tag.memberId],
		references: [member.id]
	}),
	backlogEntries: many(backlogEntry),
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
	member: one(member, {
		fields: [backlogEntry.memberId],
		references: [member.id]
	}),
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

export const coverImageRelations = relations(coverImage, ({one}) => ({
	backlogEntry: one(backlogEntry, {
		fields: [coverImage.backlogEntryId],
		references: [backlogEntry.id]
	}),
}));