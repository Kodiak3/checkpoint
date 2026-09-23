ALTER TABLE `bills` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `bills` ADD `frequency` text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE `bills` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_state` ADD `next_pay_date` text;