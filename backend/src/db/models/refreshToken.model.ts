import { Model, DataTypes, Sequelize, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';

/** A hashed refresh token. See migration 20261118000001 and lib/sessions.ts. */
export class RefreshToken extends Model<InferAttributes<RefreshToken>, InferCreationAttributes<RefreshToken>> {
    declare id: CreationOptional<number>;
    declare user_id: number;
    declare session_id: string;
    declare token_hash: string;
    declare expires_at: Date;
    declare rotated_at: CreationOptional<Date | null>;
    declare revoked_at: CreationOptional<Date | null>;
    declare created_at: CreationOptional<Date>;
}

export default function initRefreshTokenModel(sequelize: Sequelize): typeof RefreshToken {
    RefreshToken.init(
        {
            id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            session_id: { type: DataTypes.UUID, allowNull: false },
            token_hash: {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true,
            },
            expires_at: { type: DataTypes.DATE, allowNull: false },
            rotated_at: { type: DataTypes.DATE, allowNull: true },
            revoked_at: { type: DataTypes.DATE, allowNull: true },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
        },
        {
            sequelize,
            modelName: 'RefreshToken',
            tableName: 'refresh_tokens',
            timestamps: false,
            underscored: true,
        },
    );

    return RefreshToken;
}
