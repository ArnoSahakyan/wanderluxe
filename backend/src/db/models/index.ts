import { Sequelize, type Options } from 'sequelize';
import { config } from '../../config/env';
import { logger } from '../../lib/logger';

// Import model initializers and class exports
import initUserModel, { User } from './user.model';
import initRoleModel, { Role } from './role.model';
import initDestinationModel, { Destination } from './destination.model';
import initCategoryModel, { Category } from './category.model';
import initTourModel, { Tour } from './tour.model';
import initTourImageModel, { TourImage } from './tourImage.model';
import initBookingModel, { Booking } from './booking.model';
import initFavoriteModel, { Favorite } from './favorite.model';
import initReviewModel, { Review } from './review.model';
import initPostModel, { Post } from './post.model';
import initNewsletterSubscriberModel, { NewsletterSubscriber } from './newsletterSubscriber.model';
import initNewsletterVerificationModel, { NewsletterVerification } from './newsletterVerification.model';
import initContactModel, { Contact } from './contact.model';
import {DbModels} from "../../types";

// Setup Sequelize instance
const options: Options = {
  dialect: 'postgres',
  logging: config.db.logSql ? (sql: string) => logger.debug(sql) : false,
  pool: { max: config.db.poolMax, min: 0, idle: 10_000, acquire: 30_000 },
  dialectOptions: config.db.ssl ? { ssl: config.db.ssl } : {},
  timezone: '+00:00',
};

export const sequelize = config.db.url
  ? new Sequelize(config.db.url, options)
  : new Sequelize({
      ...options,
      database: config.db.name,
      username: config.db.user,
      password: config.db.password,
      host: config.db.host,
      port: config.db.port,
    });

// Initialize models
initUserModel(sequelize);
initRoleModel(sequelize);
initDestinationModel(sequelize);
initCategoryModel(sequelize);
initTourModel(sequelize);
initTourImageModel(sequelize);
initBookingModel(sequelize);
initFavoriteModel(sequelize);
initReviewModel(sequelize);
initPostModel(sequelize);
initNewsletterSubscriberModel(sequelize);
initNewsletterVerificationModel(sequelize);
initContactModel(sequelize);

// Collect models into an object to pass to associate methods
const models: DbModels = {
  User,
  Role,
  Destination,
  Category,
  Tour,
  TourImage,
  Booking,
  Favorite,
  Review,
  Post,
  NewsletterSubscriber,
  NewsletterVerification,
  Contact,
};

// Run associations
Object.values(models).forEach((model) => {
  const { associate } = model as { associate?: (all: typeof models) => void };
  if (typeof associate === 'function') {
    associate.call(model, models);
  }
});

// Export models for usage elsewhere
export {
  User,
  Role,
  Destination,
  Category,
  Tour,
  TourImage,
  Booking,
  Favorite,
  Review,
  Post,
  NewsletterSubscriber,
  NewsletterVerification,
  Contact,
};
