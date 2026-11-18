import {
    Model,
    DataTypes,
    Sequelize,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
} from 'sequelize';
import type { DbModels } from '../../types';
import type { BookingStatus } from './booking.model';
import type { User } from './user.model';

/** One booking status change. See migration 20261119000002 and lib/bookings.ts. */
export class BookingStatusHistory extends Model<
    InferAttributes<BookingStatusHistory>,
    InferCreationAttributes<BookingStatusHistory>
> {
    declare id: CreationOptional<number>;
    declare booking_id: ForeignKey<number>;
    declare from_status: BookingStatus | null;
    declare to_status: BookingStatus;
    declare changed_by: number | null;
    declare note: CreationOptional<string | null>;
    declare changed_at: CreationOptional<Date>;

    declare ChangedBy?: User | null;

    static associate(models: DbModels) {
        BookingStatusHistory.belongsTo(models.Booking, { foreignKey: 'booking_id', onDelete: 'CASCADE' });
        BookingStatusHistory.belongsTo(models.User, { as: 'ChangedBy', foreignKey: 'changed_by', constraints: false });
    }
}

export default function initBookingStatusHistoryModel(sequelize: Sequelize): typeof BookingStatusHistory {
    BookingStatusHistory.init(
        {
            id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
            booking_id: { type: DataTypes.INTEGER, allowNull: false },
            from_status: { type: DataTypes.STRING(20), allowNull: true },
            to_status: { type: DataTypes.STRING(20), allowNull: false },
            changed_by: { type: DataTypes.INTEGER, allowNull: true },
            note: { type: DataTypes.STRING(255), allowNull: true },
            changed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        {
            sequelize,
            modelName: 'BookingStatusHistory',
            tableName: 'booking_status_history',
            timestamps: false,
            underscored: true,
        },
    );
    return BookingStatusHistory;
}
