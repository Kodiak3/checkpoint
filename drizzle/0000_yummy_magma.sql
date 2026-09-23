CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount_pence` integer NOT NULL,
	`normal_amount_pence` integer,
	`timing` text NOT NULL,
	`status` text NOT NULL,
	`reserved` integer DEFAULT false NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`note` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`balance_pence` integer NOT NULL,
	`anchor_date` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`sort_date` text NOT NULL,
	`display_date` text NOT NULL,
	`amount_pence` integer NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
