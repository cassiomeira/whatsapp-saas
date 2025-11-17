CREATE TABLE `campaign_audience_members` (
	`id` integer PRIMARY KEY NOT NULL,
	`audienceId` integer NOT NULL,
	`contactId` integer NOT NULL,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_audience_members_unique` ON `campaign_audience_members` (`audienceId`,`contactId`);--> statement-breakpoint
CREATE TABLE `campaign_audiences` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`name` text NOT NULL,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bot_configs` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`masterPrompt` text,
	`transferRules` text,
	`isActive` integer DEFAULT 1 NOT NULL,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_bot_configs`("id", "workspaceId", "masterPrompt", "transferRules", "isActive", "createdAt", "updatedAt") SELECT "id", "workspaceId", "masterPrompt", "transferRules", "isActive", "createdAt", "updatedAt" FROM `bot_configs`;--> statement-breakpoint
DROP TABLE `bot_configs`;--> statement-breakpoint
ALTER TABLE `__new_bot_configs` RENAME TO `bot_configs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bot_configs_workspaceId_unique` ON `bot_configs` (`workspaceId`);--> statement-breakpoint
CREATE TABLE `__new_conversation_flows` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`flowData` text,
	`isActive` integer DEFAULT 1 NOT NULL,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_conversation_flows`("id", "workspaceId", "name", "description", "flowData", "isActive", "createdAt", "updatedAt") SELECT "id", "workspaceId", "name", "description", "flowData", "isActive", "createdAt", "updatedAt" FROM `conversation_flows`;--> statement-breakpoint
DROP TABLE `conversation_flows`;--> statement-breakpoint
ALTER TABLE `__new_conversation_flows` RENAME TO `conversation_flows`;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` integer PRIMARY KEY NOT NULL,
	`conversationId` integer NOT NULL,
	`senderType` text NOT NULL,
	`senderId` integer,
	`content` text NOT NULL,
	`messageType` text DEFAULT 'text' NOT NULL,
	`mediaUrl` text,
	`sentAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`isRead` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_messages`("id", "conversationId", "senderType", "senderId", "content", "messageType", "mediaUrl", "sentAt", "isRead") SELECT "id", "conversationId", "senderType", "senderId", "content", "messageType", "mediaUrl", "sentAt", "isRead" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;