ALTER TABLE `tabs` ADD `is_primary` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill (TASK-65): garante exatamente uma tab primária por página.
-- 1) Promove a primeira tab de cada página (menor ordem, desempate por id —
--    mesma ordenação que a app usa) a primária.
UPDATE `tabs` SET `is_primary` = 1
WHERE `id` IN (
  SELECT `id` FROM (
    SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `page_id` ORDER BY `ordem`, `id`) AS rn
    FROM `tabs`
  ) WHERE rn = 1
);
--> statement-breakpoint
-- 2) Cria a tab primária (corpo) para páginas que ainda não têm nenhuma tab.
--    id no formato UUID v4 para bater com o resto do banco (crypto.randomUUID).
INSERT INTO `tabs` (`id`, `page_id`, `titulo`, `ordem`, `is_primary`)
SELECT
  lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
  ),
  `p`.`id`, 'Conteúdo', 0, 1
FROM `pages` `p`
WHERE NOT EXISTS (SELECT 1 FROM `tabs` `t` WHERE `t`.`page_id` = `p`.`id`);
