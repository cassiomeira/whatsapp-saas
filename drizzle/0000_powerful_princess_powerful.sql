CREATE TABLE `bot_configs` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`masterPrompt` text,
	`transferRules` text,
	`isActive` integer DEFAULT 1 NOT NULL,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_configs_workspaceId_unique` ON `bot_configs` (`workspaceId`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`name` text NOT NULL,
	`message` text NOT NULL,
	`mediaUrl` text,
	`mediaType` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`totalContacts` integer DEFAULT 0,
	`sentCount` integer DEFAULT 0,
	`scheduledAt` integer,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`whatsappNumber` text NOT NULL,
	`name` text,
	`profilePicUrl` text,
	`kanbanStatus` text DEFAULT 'new_contact',
	`tags` text,
	`metadata` text,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation_flows` (
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
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`contactId` integer NOT NULL,
	`instanceId` integer NOT NULL,
	`assignedToId` integer,
	`status` text DEFAULT 'bot_handling' NOT NULL,
	`lastMessageAt` integer,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
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
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`workspaceId` integer,
	`workspaceRole` text DEFAULT 'agent',
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`lastSignedIn` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE TABLE `whatsapp_instances` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`name` text NOT NULL,
	`phoneNumber` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`instanceKey` text,
	`qrCode` text,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ownerId` integer NOT NULL,
	`metadata` text,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
