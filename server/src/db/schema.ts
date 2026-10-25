/**
 * DB 스키마 — **타입용이다. 원본은 `migrations/*.sql`.**
 *
 * 마이그레이션을 적용한 PGlite 폴더에서 뽑아온다 — `PULL_DB=<폴더> npx drizzle-kit pull` → `drizzle-pull/`.
 * 손으로 고치지 않는다 — 컬럼을 바꾸려면 SQL 마이그레이션을 추가하고 다시 뽑는다
 * (뽑은 뒤 `mode: "bigint"` 안내 주석만 걷고 이 머리말을 붙인다).
 *
 * - 시각(`timestamp`)·날짜(`date`)는 `mode: 'string'` — 원문 그대로. `Date`로 바꾸면 로컬 시간대가 끼어든다
 * - 금액(`numeric`)은 문자열로 온다 — 계산은 `common/money.ts`
 * - `bytea`(커버 바이트, V17)는 drizzle-kit이 못 읽어 `unknown("data")` + TODO로 뽑는다 → 아래 `bytea`로 바꿔 끼운다
 */
import { pgTable, unique, check, bigint, varchar, text, date, numeric, integer, timestamp, index, foreignKey, uniqueIndex, boolean, customType } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

/** 드라이버마다 다르게 온다 — PGlite는 `Uint8Array`, node-postgres는 `Buffer`(그것도 `Uint8Array`다) */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => "bytea" });

export const game = pgTable("game", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "game_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	source: varchar({ length: 20 }).notNull(),
	externalId: varchar("external_id", { length: 50 }),
	name: varchar({ length: 300 }).notNull(),
	summary: text(),
	storyline: text(),
	releasedOn: date("released_on"),
	coverImageId: varchar("cover_image_id", { length: 50 }),
	bannerImageId: varchar("banner_image_id", { length: 50 }),
	igdbRating: numeric("igdb_rating", { precision: 5, scale:  2 }),
	igdbRatingCount: integer("igdb_rating_count"),
	mainStoryHours: integer("main_story_hours"),
	mainExtraHours: integer("main_extra_hours"),
	completionistHours: integer("completionist_hours"),
	timeToBeatSamples: integer("time_to_beat_samples"),
	listPriceAmount: numeric("list_price_amount", { precision: 19, scale:  2 }),
	listPriceCurrency: varchar("list_price_currency", { length: 3 }),
	lastSyncedAt: timestamp("last_synced_at", { precision: 6, mode: 'string' }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
	mediaFolder: varchar("media_folder", { length: 200 }),
	summaryKo: text("summary_ko"),
	summaryTranslatedAt: timestamp("summary_translated_at", { precision: 6, mode: 'string' }),
	storylineKo: text("storyline_ko"),
}, (table) => [
	uniqueIndex("uk_game_media_folder").using("btree", table.mediaFolder.asc().nullsLast().op("text_ops")).where(sql`(media_folder IS NOT NULL)`),
	unique("uk_game_source_external_id").on(table.externalId, table.source),
	check("chk_game_source", sql`(source)::text = ANY ((ARRAY['IGDB'::character varying, 'MANUAL'::character varying])::text[])`),
]);

export const gameDeveloper = pgTable("game_developer", {
	gameId: bigint("game_id", { mode: "number" }).notNull(),
	developer: varchar({ length: 200 }),
}, (table) => [
	index("idx_game_developer_game").using("btree", table.gameId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [game.id],
			name: "fk_game_developer_game"
		}),
]);

export const member = pgTable("member", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "member_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	nickname: varchar({ length: 30 }).notNull(),
	memo: text(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
	backgroundColors: varchar("background_colors", { length: 64 }),
	backgroundPresets: text("background_presets"),
}, () => [
	uniqueIndex("uk_member_single").using("btree", sql`(true)`),
]);

export const gamePublisher = pgTable("game_publisher", {
	gameId: bigint("game_id", { mode: "number" }).notNull(),
	publisher: varchar({ length: 200 }),
}, (table) => [
	index("idx_game_publisher_game").using("btree", table.gameId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [game.id],
			name: "fk_game_publisher_game"
		}),
]);

export const gameMasterGenre = pgTable("game_master_genre", {
	gameId: bigint("game_id", { mode: "number" }).notNull(),
	genre: varchar({ length: 100 }),
}, (table) => [
	index("idx_game_master_genre_game").using("btree", table.gameId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [game.id],
			name: "fk_game_master_genre_game"
		}),
]);

export const gameReleasePlatform = pgTable("game_release_platform", {
	gameId: bigint("game_id", { mode: "number" }).notNull(),
	platformName: varchar("platform_name", { length: 100 }),
}, (table) => [
	index("idx_game_release_platform_game").using("btree", table.gameId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [game.id],
			name: "fk_game_release_platform_game"
		}),
]);

export const platform = pgTable("platform", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "platform_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 50 }).notNull(),
	deletedAt: timestamp("deleted_at", { precision: 6, mode: 'string' }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
}, (table) => [
	unique("uk_platform").on(table.name),
]);

export const device = pgTable("device", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "device_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	deviceType: varchar("device_type", { length: 50 }).notNull(),
	label: varchar({ length: 50 }).notNull(),
	memo: text(),
	deletedAt: timestamp("deleted_at", { precision: 6, mode: 'string' }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
}, (table) => [
	unique("uk_device").on(table.label),
]);

export const emulator = pgTable("emulator", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "emulator_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 50 }).notNull(),
	memo: text(),
	deletedAt: timestamp("deleted_at", { precision: 6, mode: 'string' }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
}, (table) => [
	unique("uk_emulator").on(table.name),
]);

export const inputMethod = pgTable("input_method", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "input_method_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 50 }).notNull(),
	deletedAt: timestamp("deleted_at", { precision: 6, mode: 'string' }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
}, (table) => [
	unique("uk_input_method").on(table.name),
]);

export const platformAccount = pgTable("platform_account", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "platform_account_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	platformId: bigint("platform_id", { mode: "number" }),
	accountLabel: varchar("account_label", { length: 50 }).notNull(),
	deletedAt: timestamp("deleted_at", { precision: 6, mode: 'string' }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
	emulatorId: bigint("emulator_id", { mode: "number" }),
	ownerKey: varchar("owner_key", { length: 24 }).notNull(),
}, (table) => [
	index("idx_platform_account_platform").using("btree", table.platformId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.platformId],
			foreignColumns: [platform.id],
			name: "fk_platform_account_platform"
		}),
	foreignKey({
			columns: [table.emulatorId],
			foreignColumns: [emulator.id],
			name: "fk_platform_account_emulator"
		}),
	unique("uk_platform_account").on(table.accountLabel, table.ownerKey),
	check("ck_platform_account_owner", sql`((platform_id IS NOT NULL) AND (emulator_id IS NULL)) OR ((platform_id IS NULL) AND (emulator_id IS NOT NULL))`),
	check("ck_platform_account_owner_key", sql`(owner_key)::text =
CASE
    WHEN (platform_id IS NOT NULL) THEN ('P'::text || platform_id)
    ELSE ('E'::text || emulator_id)
END`),
]);

export const subscription = pgTable("subscription", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "subscription_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	serviceName: varchar("service_name", { length: 100 }).notNull(),
	billingCycle: varchar("billing_cycle", { length: 20 }).notNull(),
	feeAmount: numeric("fee_amount", { precision: 19, scale:  2 }),
	feeCurrency: varchar("fee_currency", { length: 3 }),
	startedOn: date("started_on").notNull(),
	endedOn: date("ended_on"),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
}, () => [
	check("chk_subscription_billing_cycle", sql`(billing_cycle)::text = ANY ((ARRAY['MONTHLY'::character varying, 'YEARLY'::character varying])::text[])`),
]);

export const genre = pgTable("genre", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "genre_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 50 }).notNull(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
}, (table) => [
	unique("uk_genre_name").on(table.name),
]);

export const tag = pgTable("tag", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "tag_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 50 }).notNull(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
	sortOrder: integer("sort_order").notNull(),
	color: varchar({ length: 16 }),
}, (table) => [
	index("idx_tag_sort_order").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
	unique("uk_tag_name").on(table.name),
]);

export const backlogDeveloperOverride = pgTable("backlog_developer_override", {
	backlogEntryId: bigint("backlog_entry_id", { mode: "number" }).notNull(),
	developer: varchar({ length: 200 }),
}, (table) => [
	index("idx_backlog_developer_override_entry").using("btree", table.backlogEntryId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.backlogEntryId],
			foreignColumns: [backlogEntry.id],
			name: "fk_backlog_developer_override_entry"
		}),
]);

export const backlogPublisherOverride = pgTable("backlog_publisher_override", {
	backlogEntryId: bigint("backlog_entry_id", { mode: "number" }).notNull(),
	publisher: varchar({ length: 200 }),
}, (table) => [
	index("idx_backlog_publisher_override_entry").using("btree", table.backlogEntryId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.backlogEntryId],
			foreignColumns: [backlogEntry.id],
			name: "fk_backlog_publisher_override_entry"
		}),
]);

export const backlogEntryGenre = pgTable("backlog_entry_genre", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "backlog_entry_genre_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	backlogEntryId: bigint("backlog_entry_id", { mode: "number" }).notNull(),
	genreId: bigint("genre_id", { mode: "number" }).notNull(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
}, (table) => [
	index("idx_backlog_entry_genre_genre").using("btree", table.genreId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.backlogEntryId],
			foreignColumns: [backlogEntry.id],
			name: "fk_backlog_entry_genre_entry"
		}),
	foreignKey({
			columns: [table.genreId],
			foreignColumns: [genre.id],
			name: "fk_backlog_entry_genre_genre"
		}),
	unique("uk_backlog_entry_genre").on(table.backlogEntryId, table.genreId),
]);

export const acquisition = pgTable("acquisition", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "acquisition_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	backlogEntryId: bigint("backlog_entry_id", { mode: "number" }).notNull(),
	method: varchar({ length: 20 }).notNull(),
	label: varchar({ length: 100 }),
	priceAmount: numeric("price_amount", { precision: 19, scale:  2 }),
	priceCurrency: varchar("price_currency", { length: 3 }),
	acquiredOn: date("acquired_on"),
	platformId: bigint("platform_id", { mode: "number" }),
	platformAccountId: bigint("platform_account_id", { mode: "number" }),
	subscriptionId: bigint("subscription_id", { mode: "number" }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
}, (table) => [
	index("idx_acquisition_entry").using("btree", table.backlogEntryId.asc().nullsLast().op("int8_ops")),
	index("idx_acquisition_platform").using("btree", table.platformId.asc().nullsLast().op("int8_ops")),
	index("idx_acquisition_platform_account").using("btree", table.platformAccountId.asc().nullsLast().op("int8_ops")),
	index("idx_acquisition_subscription").using("btree", table.subscriptionId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.backlogEntryId],
			foreignColumns: [backlogEntry.id],
			name: "fk_acquisition_entry"
		}),
	foreignKey({
			columns: [table.platformId],
			foreignColumns: [platform.id],
			name: "fk_acquisition_platform"
		}),
	foreignKey({
			columns: [table.platformAccountId],
			foreignColumns: [platformAccount.id],
			name: "fk_acquisition_platform_account"
		}),
	foreignKey({
			columns: [table.subscriptionId],
			foreignColumns: [subscription.id],
			name: "fk_acquisition_subscription"
		}),
	check("chk_acquisition_method", sql`(method)::text = ANY ((ARRAY['PURCHASED'::character varying, 'SUBSCRIPTION'::character varying, 'FREE'::character varying, 'GIFT'::character varying, 'BORROWED'::character varying, 'DEMO'::character varying, 'NOT_OWNED'::character varying])::text[])`),
]);

export const backlogEntry = pgTable("backlog_entry", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "backlog_entry_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	gameId: bigint("game_id", { mode: "number" }).notNull(),
	status: varchar({ length: 20 }).notNull(),
	displayName: varchar("display_name", { length: 300 }).notNull(),
	nameOverride: varchar("name_override", { length: 300 }),
	releasedOnOverride: date("released_on_override"),
	releasedOnResolved: date("released_on_resolved"),
	listPriceOverrideAmount: numeric("list_price_override_amount", { precision: 19, scale:  2 }),
	listPriceOverrideCurrency: varchar("list_price_override_currency", { length: 3 }),
	rating: numeric({ precision: 4, scale:  1 }),
	playTimeHours: numeric("play_time_hours", { precision: 7, scale:  2 }),
	lastPlayedOn: date("last_played_on"),
	lastPlaythroughId: bigint("last_playthrough_id", { mode: "number" }),
	tagId: bigint("tag_id", { mode: "number" }),
	memo: text(),
	deletedAt: timestamp("deleted_at", { precision: 6, mode: 'string' }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
	displayNameSortKey: varchar("display_name_sort_key", { length: 320 }),
}, (table) => [
	index("idx_backlog_display_name").using("btree", table.displayName.asc().nullsLast().op("text_ops")),
	index("idx_backlog_entry_last_playthrough").using("btree", table.lastPlaythroughId.asc().nullsLast().op("int8_ops")),
	index("idx_backlog_entry_sort_key").using("btree", table.displayNameSortKey.asc().nullsLast().op("text_ops")),
	index("idx_backlog_last_played").using("btree", table.lastPlayedOn.desc().nullsLast().op("date_ops")),
	index("idx_backlog_play_time").using("btree", table.playTimeHours.desc().nullsLast().op("numeric_ops")),
	index("idx_backlog_rating").using("btree", table.rating.desc().nullsLast().op("numeric_ops")),
	index("idx_backlog_released_on").using("btree", table.releasedOnResolved.desc().nullsLast().op("date_ops")),
	index("idx_backlog_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_backlog_tag").using("btree", table.tagId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [game.id],
			name: "fk_backlog_entry_game"
		}),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [tag.id],
			name: "fk_backlog_entry_tag"
		}),
	// fk_backlog_entry_last_playthrough → playthrough.id 는 DB에만 있다.
	// playthrough도 backlog_entry를 참조해서 여기 적으면 타입 추론이 순환한다 (DDL은 SQL이 쥔다)
	unique("uk_backlog_entry_game").on(table.gameId),
	check("chk_backlog_entry_status", sql`(status)::text = ANY ((ARRAY['WISHLIST'::character varying, 'BACKLOG'::character varying, 'PLAYING'::character varying, 'PAUSED'::character varying, 'DROPPED'::character varying, 'COMPLETED'::character varying])::text[])`),
]);

export const playthrough = pgTable("playthrough", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "playthrough_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	backlogEntryId: bigint("backlog_entry_id", { mode: "number" }).notNull(),
	sequenceNo: integer("sequence_no").notNull(),
	status: varchar({ length: 20 }).notNull(),
	label: varchar({ length: 100 }),
	startedOn: date("started_on").notNull(),
	finishedOn: date("finished_on"),
	platformAccountId: bigint("platform_account_id", { mode: "number" }),
	deviceId: bigint("device_id", { mode: "number" }),
	emulatorId: bigint("emulator_id", { mode: "number" }),
	inputMethodId: bigint("input_method_id", { mode: "number" }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
	platformId: bigint("platform_id", { mode: "number" }),
}, (table) => [
	index("idx_playthrough_device").using("btree", table.deviceId.asc().nullsLast().op("int8_ops")),
	index("idx_playthrough_emulator").using("btree", table.emulatorId.asc().nullsLast().op("int8_ops")),
	index("idx_playthrough_input_method").using("btree", table.inputMethodId.asc().nullsLast().op("int8_ops")),
	index("idx_playthrough_platform_account").using("btree", table.platformAccountId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.backlogEntryId],
			foreignColumns: [backlogEntry.id],
			name: "fk_playthrough_entry"
		}),
	foreignKey({
			columns: [table.platformAccountId],
			foreignColumns: [platformAccount.id],
			name: "fk_playthrough_platform_account"
		}),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [device.id],
			name: "fk_playthrough_device"
		}),
	foreignKey({
			columns: [table.emulatorId],
			foreignColumns: [emulator.id],
			name: "fk_playthrough_emulator"
		}),
	foreignKey({
			columns: [table.inputMethodId],
			foreignColumns: [inputMethod.id],
			name: "fk_playthrough_input_method"
		}),
	foreignKey({
			columns: [table.platformId],
			foreignColumns: [platform.id],
			name: "fk_playthrough_platform"
		}),
	unique("uk_playthrough_sequence").on(table.backlogEntryId, table.sequenceNo),
	check("chk_playthrough_status", sql`(status)::text = ANY ((ARRAY['PLAYING'::character varying, 'PAUSED'::character varying, 'DROPPED'::character varying, 'COMPLETED'::character varying])::text[])`),
]);

export const coverImage = pgTable("cover_image", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "cover_image_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	backlogEntryId: bigint("backlog_entry_id", { mode: "number" }).notNull(),
	storageKey: varchar("storage_key", { length: 300 }).notNull(),
	contentType: varchar("content_type", { length: 100 }).notNull(),
	sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
	location: varchar({ length: 20 }).notNull(),
	data: bytea("data"),
}, (table) => [
	foreignKey({
			columns: [table.backlogEntryId],
			foreignColumns: [backlogEntry.id],
			name: "fk_cover_image_entry"
		}),
	unique("uk_cover_image_backlog_entry").on(table.backlogEntryId),
	check("chk_cover_image_location", sql`(location)::text = ANY ((ARRAY['LOCAL'::character varying, 'EXTERNAL'::character varying, 'DB'::character varying])::text[])`),
	check("chk_cover_image_data", sql`((location)::text = 'DB'::text) = (data IS NOT NULL)`),
]);

export const appSetting = pgTable("app_setting", {
	settingKey: varchar("setting_key", { length: 100 }).primaryKey().notNull(),
	settingValue: text("setting_value"),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
});

export const apiCallLog = pgTable("api_call_log", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "api_call_log_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	provider: varchar({ length: 20 }).notNull(),
	operation: varchar({ length: 50 }).notNull(),
	calledAt: timestamp("called_at", { precision: 6, mode: 'string' }).notNull(),
	success: boolean().notNull(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
	units: bigint({ mode: "number" }),
}, (table) => [
	index("idx_api_call_log_provider_called").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.calledAt.asc().nullsLast().op("text_ops")),
	index("idx_api_call_log_provider_called_at").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.calledAt.asc().nullsLast().op("text_ops")),
]);

export const playRecord = pgTable("play_record", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "play_record_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	backlogEntryId: bigint("backlog_entry_id", { mode: "number" }).notNull(),
	kind: varchar({ length: 20 }).notNull(),
	minutes: numeric({ precision: 8, scale:  1 }).notNull(),
	playedOn: date("played_on").notNull(),
	note: varchar({ length: 100 }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
}, (table) => [
	index("idx_play_record_entry").using("btree", table.backlogEntryId.asc().nullsLast().op("date_ops"), table.playedOn.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.backlogEntryId],
			foreignColumns: [backlogEntry.id],
			name: "fk_play_record_entry"
		}),
	check("chk_play_record_kind", sql`(kind)::text = ANY ((ARRAY['BASELINE'::character varying, 'ADJUST'::character varying, 'ADD'::character varying])::text[])`),
	check("chk_play_record_add_positive", sql`((kind)::text <> 'ADD'::text) OR (minutes > (0)::numeric)`),
]);

export const homeopsPlayLog = pgTable("homeops_play_log", {
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "homeops_play_log_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	backlogEntryId: bigint("backlog_entry_id", { mode: "number" }).notNull(),
	externalId: varchar("external_id", { length: 200 }).notNull(),
	startedAt: timestamp("started_at", { precision: 6, mode: 'string' }).notNull(),
	endedAt: timestamp("ended_at", { precision: 6, mode: 'string' }).notNull(),
	minutes: integer().notNull(),
	label: varchar({ length: 200 }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }),
}, (table) => [
	index("idx_homeops_play_log_entry").using("btree", table.backlogEntryId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.backlogEntryId],
			foreignColumns: [backlogEntry.id],
			name: "fk_homeops_play_log_entry"
		}).onDelete("cascade"),
	unique("uk_homeops_play_log_external").on(table.externalId),
	check("chk_homeops_play_log_minutes", sql`minutes >= 0`),
	check("chk_homeops_play_log_range", sql`ended_at >= started_at`),
]);
