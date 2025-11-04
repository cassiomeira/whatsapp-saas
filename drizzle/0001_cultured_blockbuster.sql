CREATE TABLE `product_uploads` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`fileName` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`rowCount` integer,
	`errorMessage` text,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspaceId` integer NOT NULL,
	`uploadId` integer NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`quantity` integer DEFAULT 0,
	`description` text,
	`createdAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_workspace_sku_unique` ON `products` (`workspaceId`,`sku`);