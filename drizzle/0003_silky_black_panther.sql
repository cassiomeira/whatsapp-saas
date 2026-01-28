CREATE TABLE `contact_status_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`contactId` integer NOT NULL,
	`statusFrom` text NOT NULL,
	`statusTo` text NOT NULL,
	`assignedToId` integer,
	`changedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ixc_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`contactId` integer,
	`conversationId` integer,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`invoiceId` integer,
	`message` text,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `whatsappMessageId` text;