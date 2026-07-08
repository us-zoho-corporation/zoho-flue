import type { User, UserStore } from '../types';
import type { CatalystNoSqlClient, Item } from './nosql-client';
import { numOf, strOf, strOrNull } from './nosql-helpers';

const TABLE = 'Users';

/**
 * Maps a domain `User` to its `Users` NoSQL item (partition key = `UserId`).
 * @param user - The user record to serialize.
 * @returns The item payload; a null `photoId` is omitted (absent decodes back to null).
 */
function toItem(user: User): Item {
	return {
		UserId: user.userId,
		Email: user.email,
		DisplayName: user.displayName,
		FirstName: user.firstName,
		LastName: user.lastName,
		PhotoId: user.photoId,
		CreatedAt: user.createdAt,
		LastLoginAt: user.lastLoginAt,
	};
}

/**
 * Maps a raw `Users` NoSQL item to the domain `User` shape.
 * @param item - The decoded NoSQL item.
 * @returns The parsed user record.
 */
function fromItem(item: Item): User {
	return {
		userId: strOf(item.UserId),
		email: strOf(item.Email),
		displayName: strOf(item.DisplayName),
		firstName: strOf(item.FirstName),
		lastName: strOf(item.LastName),
		photoId: strOrNull(item.PhotoId),
		createdAt: numOf(item.CreatedAt),
		lastLoginAt: numOf(item.LastLoginAt),
	};
}

export class CatalystUserStore implements UserStore {
	/**
	 * Creates a store backed by the `Users` NoSQL table.
	 * @param client - NoSQL REST client to read/write through.
	 */
	constructor(private readonly client: CatalystNoSqlClient) {}

	/**
	 * Inserts or replaces a user, keyed by `user.userId` (put/overwrite).
	 * @param user - The user record to store.
	 * @returns The same `user` record passed in.
	 * @throws {Error} If the insert request fails.
	 */
	async upsert(user: User): Promise<User> {
		await this.client.insertItem(TABLE, toItem(user));
		return user;
	}

	/**
	 * Fetches a user by their Zoho user id (ZUID).
	 * @param userId - User id (ZUID) to look up.
	 * @returns The user record, or `null` if none exists.
	 * @throws {Error} If the underlying query fails.
	 */
	async getById(userId: string): Promise<User | null> {
		const item = await this.client.getItem(TABLE, { partition: userId });
		return item ? fromItem(item) : null;
	}

	/**
	 * Updates a user's last-login timestamp. A no-op if the user doesn't exist.
	 * @param userId - User id (ZUID) to update.
	 * @param at - New last-login timestamp (epoch ms).
	 * @throws {Error} If the update request fails.
	 */
	async touchLogin(userId: string, at: number): Promise<void> {
		await this.client.updateItem(TABLE, { partition: userId }, { LastLoginAt: at });
	}
}
