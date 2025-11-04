CREATE TABLE `bot_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`masterPrompt` text,
	`transferRules` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `bot_configs_workspaceId_unique` UNIQUE(`workspaceId`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`mediaUrl` text,
	`mediaType` varchar(20),
	`status` enum('draft','scheduled','sending','completed','failed') NOT NULL DEFAULT 'draft',
	`totalContacts` int DEFAULT 0,
	`sentCount` int DEFAULT 0,
	`scheduledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`whatsappNumber` varchar(40) NOT NULL,
	`name` varchar(255),
	`profilePicUrl` text,
	`kanbanStatus` varchar(50) DEFAULT 'new_contact',
	`tags` json,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversation_flows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`flowData` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversation_flows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`contactId` int NOT NULL,
	`instanceId` int NOT NULL,
	`assignedToId` int,
	`status` enum('bot_handling','pending_human','in_progress','closed') NOT NULL DEFAULT 'bot_handling',
	`lastMessageAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderType` enum('contact','bot','agent') NOT NULL,
	`senderId` int,
	`content` text NOT NULL,
	`messageType` varchar(20) NOT NULL DEFAULT 'text',
	`mediaUrl` text,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`isRead` boolean NOT NULL DEFAULT false,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_instances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`phoneNumber` varchar(40),
	`status` enum('disconnected','connecting','connected','failed') NOT NULL DEFAULT 'disconnected',
	`instanceKey` varchar(255),
	`qrCode` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_instances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`ownerId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `workspaceId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `workspaceRole` enum('owner','admin','agent') DEFAULT 'agent';