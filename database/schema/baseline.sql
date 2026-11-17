-- WanderLuxe baseline schema + public catalogue data
-- Derived from database/dump/wanderluxe.sql with personal data removed
-- (INSERTs into users, bookings and favorites are stripped).
-- Used by tests and by developers who do not have the private dump.
-- Do not edit by hand; schema changes go into backend/src/db/migrations.

-- Roles
CREATE SEQUENCE IF NOT EXISTS roles_role_id_seq;
CREATE TABLE "public"."roles" (
    "role_id" int4 NOT NULL DEFAULT nextval('roles_role_id_seq'::regclass),
    "name" varchar(255) NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("role_id")
);
CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);
INSERT INTO "public"."roles" ("role_id", "name", "created_at", "updated_at") VALUES
(1, 'admin', now(), now()), (2, 'customer', now(), now());

-- Users
CREATE SEQUENCE IF NOT EXISTS users_user_id_seq;
CREATE TABLE "public"."users" (
    "user_id" int4 NOT NULL DEFAULT nextval('users_user_id_seq'::regclass),
    "full_name" varchar(255) NOT NULL,
    "email" varchar(255) NOT NULL,
    "password" varchar(255) NOT NULL,
    "phone_number" varchar(255),
    "role_id" int4,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    "deleted_at" timestamptz,
    "reset_password_token" varchar(255),
    "reset_token_expires" timestamptz,
    CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("role_id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("user_id")
);
CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

-- Destinations
CREATE SEQUENCE IF NOT EXISTS destinations_destination_id_seq;
CREATE TABLE "public"."destinations" (
    "destination_id" int4 NOT NULL DEFAULT nextval('destinations_destination_id_seq'::regclass),
    "name" varchar(255) NOT NULL,
    "description" text,
    "image" varchar(255),
    PRIMARY KEY ("destination_id")
);
INSERT INTO "public"."destinations" ("destination_id", "name", "description", "image") VALUES
(1, 'Australia', 'Adventure awaits in Australia—home to stunning beaches, unique wildlife, and the Great Barrier Reef.', 'Australia/Australia_6b097d6c-877c-4de1-8a8f-a5483a1d1e5f.webp');
INSERT INTO "public"."destinations" ("destination_id", "name", "description", "image") VALUES
(2, 'Italy', 'Discover Italy''s rich history, world-famous cuisine, and breathtaking landscapes from Venice to Rome.', 'Italy/Italy_b5bc2aac-e541-401b-8e30-1f06a3571e25.webp');
INSERT INTO "public"."destinations" ("destination_id", "name", "description", "image") VALUES
(3, 'Japan', 'Experience the perfect blend of tradition and innovation in Japan, from ancient temples to futuristic cities.', 'Japan/Japan_bb41ccb7-bfaa-487a-9c0d-1175601a1857.webp');
INSERT INTO "public"."destinations" ("destination_id", "name", "description", "image") VALUES
(4, 'France', 'Explore the romantic charm of France, with its iconic landmarks, exquisite food, and vibrant culture.', 'France/France_bd14c821-7029-4884-845d-8893aa3546fb.webp'),
(5, 'Brazil', 'Embrace the rhythm of Brazil, known for its lively festivals, Amazon rainforest, and dynamic cities.', 'Brazil/Brazil_a7c4bcd8-e716-4779-b1b0-9c69c7d2fc3c.webp'),
(6, 'Canada', 'From majestic mountains to multicultural cities, Canada offers a diverse and scenic escape year-round.', 'Canada/Canada_34755387-4dc0-4d66-ae22-3d45ff71260b.webp'),
(7, 'Egypt', 'Step back in time in Egypt and witness the grandeur of ancient pyramids, temples, and the Nile River.', 'Egypt/Egypt_e5b8d43e-37ab-41fe-94ed-a7a374a9abe4.webp'),
(8, 'Thailand', 'Savor Thailand’s vibrant street food, pristine beaches, and rich cultural heritage.', 'Thailand/Thailand_74556816-be84-47d9-ad7f-6703f69f20b9.webp'),
(9, 'Greece', 'Uncover the beauty of Greece with its white-washed villages, turquoise seas, and mythological sites.', 'Greece/Greece_56763655-2532-4b96-8e18-70c38b3f81b0.webp'),
(10, 'South Africa', 'Enjoy unforgettable safaris, coastal drives, and a melting pot of cultures in South Africa.', 'South_Africa/South_Africa_fac4247e-2231-42f5-be14-34ae965c0c82.webp');

-- Categories
CREATE SEQUENCE IF NOT EXISTS categories_category_id_seq;
CREATE TABLE "public"."categories" (
    "category_id" int4 NOT NULL DEFAULT nextval('categories_category_id_seq'::regclass),
    "name" varchar(255) NOT NULL,
    PRIMARY KEY ("category_id")
);
INSERT INTO "public"."categories" ("category_id", "name") VALUES
(1, 'Adventure');
INSERT INTO "public"."categories" ("category_id", "name") VALUES
(2, 'Cultural');
INSERT INTO "public"."categories" ("category_id", "name") VALUES
(3, 'Relaxation');
INSERT INTO "public"."categories" ("category_id", "name") VALUES
(4, 'Wildlife'),
(5, 'Family'),
(6, 'Romantic'),
(7, 'Historical');

-- Tours
CREATE SEQUENCE IF NOT EXISTS tours_tour_id_seq;
CREATE TABLE "public"."tours" (
    "tour_id" int4 NOT NULL DEFAULT nextval('tours_tour_id_seq'::regclass),
    "name" varchar(255) NOT NULL,
    "description" text,
    "price" numeric(10,2) NOT NULL,
    "start_date" timestamptz NOT NULL,
    "end_date" timestamptz NOT NULL,
    "available_spots" int4 NOT NULL DEFAULT 0,
    "category_id" int4,
    "destination_id" int4,
    CONSTRAINT "tours_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("category_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tours_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("destination_id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("tour_id")
);
INSERT INTO "public"."tours" ("tour_id", "name", "description", "price", "start_date", "end_date", "available_spots", "category_id", "destination_id") VALUES
(2, 'Coastal Highlights of Australia', 'Enjoy Australia’s stunning coastlines, from the Great Ocean Road to the beaches of Sydney.', 1999.99, '2025-11-01 04:00:00+04', '2025-11-10 04:00:00+04', 8, 1, 1);
INSERT INTO "public"."tours" ("tour_id", "name", "description", "price", "start_date", "end_date", "available_spots", "category_id", "destination_id") VALUES
(3, 'Outback Explorer in Australia', 'Experience the raw beauty of Australia''s Outback, with desert hikes, wildlife safaris, and stargazing nights.', 2299.99, '2025-09-15 04:00:00+04', '2025-09-25 04:00:00+04', 8, 4, 1);
INSERT INTO "public"."tours" ("tour_id", "name", "description", "price", "start_date", "end_date", "available_spots", "category_id", "destination_id") VALUES
(4, 'Family Fun in Gold Coast', 'Perfect for families — enjoy theme parks, sunny beaches, and interactive wildlife experiences.', 1899.00, '2025-07-10 04:00:00+04', '2025-07-17 04:00:00+04', 14, 5, 1);

-- Tour Images
CREATE SEQUENCE IF NOT EXISTS tour_images_image_id_seq;
CREATE TABLE "public"."tour_images" (
    "image_id" int4 NOT NULL DEFAULT nextval('tour_images_image_id_seq'::regclass),
    "tour_id" int4 NOT NULL,
    "image_url" varchar(255) NOT NULL,
    "is_cover" bool NOT NULL DEFAULT false,
    CONSTRAINT "tour_images_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("tour_id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("image_id")
);
INSERT INTO "public"."tour_images" ("image_id", "tour_id", "image_url", "is_cover") VALUES
(1, 2, '2/2_7cf25b6f-9e6d-4fc7-a9e3-2954a421ed87.webp', 't');
INSERT INTO "public"."tour_images" ("image_id", "tour_id", "image_url", "is_cover") VALUES
(2, 2, '2/2_6910bd9f-d2dc-400c-80c9-03f56c342694.webp', 'f');
INSERT INTO "public"."tour_images" ("image_id", "tour_id", "image_url", "is_cover") VALUES
(3, 3, '3/3_b0bbe7ec-3302-4c1f-b4bf-7f2e7aa2abf6.webp', 't');
INSERT INTO "public"."tour_images" ("image_id", "tour_id", "image_url", "is_cover") VALUES
(4, 3, '3/3_44a0995a-564c-4261-80b7-0f89427ff322.webp', 'f'),
(5, 3, '3/3_11352dba-83c5-4164-ab21-9aa4ad9ba95c.webp', 'f'),
(6, 3, '3/3_e7f64142-af1b-4515-b674-83ee6933e122.webp', 'f'),
(7, 3, '3/3_dd8bd01f-191d-4269-bae3-2dc4be02a2c9.webp', 'f'),
(8, 4, '4/4_993aee2a-031f-4817-aa60-369024861bb9.webp', 't'),
(9, 4, '4/4_323d88f6-fc12-4439-b2e5-08b35890f480.webp', 'f'),
(10, 4, '4/4_654019e0-2cdb-4aec-b5ec-aa99a8308132.webp', 'f'),
(11, 4, '4/4_8b27e63f-deac-4596-9900-b1e4d45bd358.webp', 'f'),
(12, 4, '4/4_fb00fe92-20cd-40c8-804d-e3c942b69adb.webp', 'f');

-- Bookings
CREATE SEQUENCE IF NOT EXISTS bookings_booking_id_seq;
DROP TYPE IF EXISTS "public"."enum_bookings_status";
CREATE TYPE "public"."enum_bookings_status" AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'refunded');
CREATE TABLE "public"."bookings" (
    "booking_id" int4 NOT NULL DEFAULT nextval('bookings_booking_id_seq'::regclass),
    "user_id" int4 NOT NULL,
    "tour_id" int4 NOT NULL,
    "booking_date" timestamptz NOT NULL DEFAULT now(),
    "number_of_people" int4 NOT NULL,
    "total_price" numeric(10,2) NOT NULL,
    "status" "public"."enum_bookings_status" NOT NULL DEFAULT 'pending',
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bookings_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("tour_id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("booking_id")
);

-- Favorites
CREATE SEQUENCE IF NOT EXISTS favorites_favorite_id_seq;
CREATE TABLE "public"."favorites" (
    "favorite_id" int4 NOT NULL DEFAULT nextval('favorites_favorite_id_seq'::regclass),
    "user_id" int4 NOT NULL,
    "tour_id" int4 NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "favorites_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("tour_id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("favorite_id")
);

-- Reviews
CREATE SEQUENCE IF NOT EXISTS reviews_review_id_seq;
CREATE TABLE "public"."reviews" (
    "review_id" int4 NOT NULL DEFAULT nextval('reviews_review_id_seq'::regclass),
    "user_id" int4 NOT NULL,
    "tour_id" int4 NOT NULL,
    "rating" int4 NOT NULL,
    "comment" text,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reviews_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("tour_id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("review_id")
);
-- Add inserts if needed

-- Newsletter Subscribers
CREATE SEQUENCE IF NOT EXISTS newsletter_subscribers_subscriber_id_seq;
CREATE TABLE "public"."newsletter_subscribers" (
    "subscriber_id" int4 NOT NULL DEFAULT nextval('newsletter_subscribers_subscriber_id_seq'::regclass),
    "email" varchar(255) NOT NULL,
    "subscribed_at" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("subscriber_id")
);
CREATE UNIQUE INDEX newsletter_subscribers_email_key ON public.newsletter_subscribers USING btree (email);

-- Newsletter Verifications
CREATE SEQUENCE IF NOT EXISTS newsletter_verifications_id_seq;
CREATE TABLE "public"."newsletter_verifications" (
    "id" int4 NOT NULL DEFAULT nextval('newsletter_verifications_id_seq'::regclass),
    "email" varchar(255) NOT NULL,
    "token" varchar(255) NOT NULL,
    "expires_at" timestamptz NOT NULL,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX newsletter_verifications_token_key ON public.newsletter_verifications USING btree (token);

-- Posts
CREATE SEQUENCE IF NOT EXISTS posts_post_id_seq;
CREATE TABLE "public"."posts" (
    "post_id" int4 NOT NULL DEFAULT nextval('posts_post_id_seq'::regclass),
    "title" varchar(255) NOT NULL,
    "slug" varchar(255) NOT NULL,
    "excerpt" text,
    "content" text,
    "image" varchar(255),
    "is_published" bool NOT NULL DEFAULT false,
    "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("post_id")
);
CREATE UNIQUE INDEX posts_slug_key ON public.posts USING btree (slug);

-- SequelizeMeta (last)
CREATE TABLE "public"."SequelizeMeta" (
    "name" varchar(255) NOT NULL,
    PRIMARY KEY ("name")
);
INSERT INTO "public"."SequelizeMeta" ("name") VALUES
('20250531140140-create-roles.cjs');
INSERT INTO "public"."SequelizeMeta" ("name") VALUES
('20250531140147-create-users.cjs');
INSERT INTO "public"."SequelizeMeta" ("name") VALUES
('20250531140204-create-destinations.cjs');
INSERT INTO "public"."SequelizeMeta" ("name") VALUES
('20250531140205-create-categories.cjs'),
('20250531140205-create-tours.cjs'),
('20250531140206-create-tour-images.cjs'),
('20250531140207-create-bookings.cjs'),
('20250531140207-create-favorites.cjs'),
('20250531140208-create-reviews.cjs'),
('20250531140209-create-newsletter-subscribers.cjs'),
('20250531140209-create-posts.cjs'),
('20250531140217-create-newsletter-verifications.cjs'),
('20250617091526-add-reset-password-fields-to-users.cjs');