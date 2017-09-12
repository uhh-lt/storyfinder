CREATE TABLE IF NOT EXISTS `articles` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `site_id` int(10) UNSIGNED NOT NULL,
  `raw` longtext CHARACTER SET utf8 NOT NULL,
  `text` text CHARACTER SET utf8 NOT NULL,
  `excerpt` text CHARACTER SET utf8,
  `byline` text CHARACTER SET utf8,
  `title` text CHARACTER SET utf8 NOT NULL,
  `created` datetime NOT NULL,
  `collection_id` int(10) UNSIGNED NOT NULL,
  `is_deleted` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `site_id` (`site_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `articles_entities` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `article_id` int(10) UNSIGNED NOT NULL,
  `entity_id` int(10) UNSIGNED NOT NULL,
  `count` smallint(5) UNSIGNED NOT NULL,
  `created` datetime NOT NULL,
  `is_deleted` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `article_id` (`article_id`,`entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `articles_tokens` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `token_id` int(10) UNSIGNED NOT NULL,
  `article_id` int(10) UNSIGNED NOT NULL,
  `count` tinyint(3) UNSIGNED NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `changelogs` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `created` datetime NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `changelogs_updates` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `changelog_id` int(10) UNSIGNED NOT NULL,
  `tbl` varchar(32) NOT NULL,
  `foreign_id` int(11) NOT NULL,
  `vals` longtext CHARACTER SET utf8 NOT NULL,
  PRIMARY KEY (`id`),
  KEY `changelog_id` (`changelog_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `collections` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `name` varchar(128) NOT NULL,
  `created` datetime NOT NULL,
  `modified` datetime NOT NULL,
  `is_deleted` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `entities` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `value` varchar(128) CHARACTER SET utf8 NOT NULL,
  `tokens` tinyint(3) UNSIGNED NOT NULL,
  `multiword` varchar(128) CHARACTER SET utf8 DEFAULT NULL,
  `caption` text CHARACTER SET utf8 NOT NULL,
  `type` varchar(5) NOT NULL,
  `master_id` int(10) UNSIGNED DEFAULT NULL,
  `created` datetime NOT NULL,
  `modified` datetime DEFAULT NULL,
  `collection_id` int(10) UNSIGNED NOT NULL,
  `last_seen` datetime NOT NULL,
  `is_deleted` tinyint(1) DEFAULT NULL,
  `show_always` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `value_2` (`value`,`multiword`,`collection_id`),
  KEY `user_id` (`collection_id`,`last_seen`),
  KEY `master_id` (`master_id`),
  KEY `value` (`value`,`collection_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `entities_sentences` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `entity_id` int(10) UNSIGNED NOT NULL,
  `sentence_id` int(10) UNSIGNED NOT NULL,
  `created` datetime NOT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `entity_id` (`entity_id`,`sentence_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `log_entities` (
  `id` int(10) UNSIGNED NOT NULL DEFAULT '0',
  `updated_on` datetime NOT NULL DEFAULT '0000-00-00 00:00:00' ON UPDATE CURRENT_TIMESTAMP,
  `value` varchar(128) DEFAULT NULL,
  `tokens` tinyint(3) UNSIGNED DEFAULT NULL,
  `multiword` varchar(128) DEFAULT NULL,
  `caption` text,
  `type` varchar(5) DEFAULT NULL,
  `master_id` int(10) UNSIGNED DEFAULT NULL,
  `created` datetime DEFAULT NULL,
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `last_seen` datetime DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`,`updated_on`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `ngrams` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `value` varchar(64) CHARACTER SET utf8 NOT NULL,
  `collection_id` int(10) UNSIGNED NOT NULL,
  `docs` smallint(5) UNSIGNED NOT NULL,
  `created` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `value` (`value`,`collection_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `relations` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `entity1_id` int(10) UNSIGNED NOT NULL,
  `entity2_id` int(10) UNSIGNED NOT NULL,
  `relationtype_id` int(10) UNSIGNED DEFAULT NULL,
  `direction` tinyint(4) DEFAULT NULL,
  `created` datetime NOT NULL,
  `is_deleted` tinyint(1) DEFAULT NULL,
  `user_generated` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `entity1_entity2` (`entity1_id`,`entity2_id`) USING BTREE,
  KEY `entity2_id` (`entity2_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `relations_sentences` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `relation_id` int(10) UNSIGNED NOT NULL,
  `sentence_id` int(10) UNSIGNED NOT NULL,
  `relationtype_id` int(10) UNSIGNED DEFAULT NULL,
  `direction` tinyint(4) DEFAULT NULL,
  `created` datetime NOT NULL,
  `is_deleted` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `relation_id` (`relation_id`),
  KEY `relationtype_id` (`relationtype_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `relationtypes` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `collection_id` int(10) UNSIGNED NOT NULL,
  `label` text NOT NULL,
  `pattern` text,
  `created` datetime NOT NULL,
  `is_deleted` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `sentences` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `article_id` int(10) UNSIGNED NOT NULL,
  `text` text CHARACTER SET utf8 NOT NULL,
  `created` datetime NOT NULL,
  `is_deleted` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `article_id` (`article_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `sites` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `url` varchar(512) NOT NULL,
  `hash` varchar(64) NOT NULL,
  `host` varchar(128) NOT NULL,
  `title` text CHARACTER SET utf8,
  `favicon` text,
  `last_visited` datetime NOT NULL,
  `primary_color` varchar(6) DEFAULT NULL,
  `collection_id` int(10) UNSIGNED NOT NULL,
  `created` datetime NOT NULL,
  `is_deleted` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `url` (`collection_id`,`url`,`hash`) USING BTREE,
  KEY `url_2` (`url`,`collection_id`,`last_visited`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `tokens` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `token` varchar(64) NOT NULL,
  `stemm` varchar(64) NOT NULL,
  `pos` varchar(16) NOT NULL,
  `docs` smallint(6) NOT NULL,
  `created` datetime NOT NULL,
  `modified` datetime NOT NULL,
  `is_deleted` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`,`token`,`pos`,`stemm`) USING BTREE,
  KEY `user_id_2` (`user_id`,`stemm`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `users` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` varchar(128) NOT NULL,
  `password` text NOT NULL,
  `created` datetime NOT NULL,
  `modified` datetime NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS `visits` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `site_id` int(10) UNSIGNED NOT NULL,
  `duration` int(10) UNSIGNED DEFAULT NULL,
  `referrer` int(10) UNSIGNED DEFAULT NULL,
  `created` datetime NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `is_deleted` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `site_id` (`site_id`),
  KEY `created` (`user_id`,`created`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
