import {
	AttachmentConflictError,
	copyAttachmentBytes,
	sameAttachmentRef,
	verifyAttachmentBytes,
	type AttachmentRef,
	type AttachmentStore,
	type GetAttachmentInput,
	type PutAttachmentInput,
	type StoredAttachment,
} from '@flue/runtime/adapter';
import type { CatalystNoSqlClient, Item } from '../nosql-client';
import type { CatalystStratusClient } from './stratus-client';

/** NoSQL table holding attachment metadata (partition = StreamPath, sort = AttachmentId). */
export const ATTACHMENTS_TABLE = 'FlueAttachments';

/**
 * Builds the Stratus object key for an attachment's bytes.
 * @param streamPath - Owning conversation-stream path.
 * @param attachmentId - Attachment id.
 * @returns The object key.
 */
function objectKey(streamPath: string, attachmentId: string): string {
	return `${streamPath}/${attachmentId}`;
}

/**
 * Reconstructs an {@link AttachmentRef} from a stored metadata item.
 * @param item - The decoded metadata item.
 * @returns The attachment ref.
 */
function toRef(item: Item): AttachmentRef {
	return { id: String(item.AttachmentId), mimeType: String(item.MimeType), size: Number(item.Size), digest: String(item.Digest) };
}

/**
 * Flue {@link AttachmentStore} storing immutable bytes in Stratus and the
 * metadata/conversation binding in NoSQL. `put` verifies byte integrity, is
 * idempotent for an exact re-put, and rejects an id reused with different bytes
 * or a different conversation. `get` is scoped to the owning conversation.
 */
export class CatalystAttachmentStore implements AttachmentStore {
	/**
	 * Creates a store over the given clients.
	 * @param nosql - NoSQL client for attachment metadata.
	 * @param stratus - Stratus client for attachment bytes.
	 */
	constructor(private readonly nosql: CatalystNoSqlClient, private readonly stratus: CatalystStratusClient) {}

	/**
	 * Stores an attachment. Idempotent for identical bytes/metadata/conversation.
	 * @param input - Stream path, attachment ref, bytes, and owning conversation.
	 * @throws {AttachmentIntegrityError} If `bytes` don't match the ref's size/digest.
	 * @throws {AttachmentConflictError} If the id is reused with different bytes or conversation.
	 * @throws {Error} If a store write fails.
	 */
	async put(input: PutAttachmentInput): Promise<void> {
		await verifyAttachmentBytes(input.attachment, input.bytes);
		const existing = await this.nosql.getItem(
			ATTACHMENTS_TABLE, { partition: input.streamPath, sort: input.attachment.id }, 'AttachmentId');
		if (existing) {
			if (sameAttachmentRef(toRef(existing), input.attachment) && String(existing.ConversationId) === input.conversationId) {
				return; // exact idempotent re-put — bytes already durable in Stratus
			}
			throw new AttachmentConflictError({ path: input.streamPath, attachmentId: input.attachment.id });
		}
		await this.stratus.putObject(objectKey(input.streamPath, input.attachment.id), input.bytes, input.attachment.mimeType);
		await this.nosql.insertItem(ATTACHMENTS_TABLE, {
			StreamPath: input.streamPath,
			AttachmentId: input.attachment.id,
			ConversationId: input.conversationId,
			MimeType: input.attachment.mimeType,
			Size: input.attachment.size,
			Digest: input.attachment.digest,
		});
	}

	/**
	 * Fetches an attachment, scoped to the requesting conversation.
	 * @param input - Stream path, conversation id, and attachment id.
	 * @returns The stored attachment, or `null` if absent or owned by another conversation.
	 * @throws {Error} If a store read fails.
	 */
	async get(input: GetAttachmentInput): Promise<StoredAttachment | null> {
		const meta = await this.nosql.getItem(
			ATTACHMENTS_TABLE, { partition: input.streamPath, sort: input.attachmentId }, 'AttachmentId');
		if (!meta || String(meta.ConversationId) !== input.conversationId) return null;
		const bytes = await this.stratus.getObject(objectKey(input.streamPath, input.attachmentId));
		if (!bytes) return null;
		return { attachment: toRef(meta), bytes: copyAttachmentBytes(bytes) };
	}

	/**
	 * Deletes every attachment (bytes + metadata) for an agent instance.
	 * @param streamPath - The instance's conversation-stream path.
	 * @throws {Error} If a store delete fails.
	 */
	async deleteForInstance(streamPath: string): Promise<void> {
		const metas = await this.nosql.queryPartition(ATTACHMENTS_TABLE, streamPath);
		await this.stratus.deleteObjects(metas.map((m) => objectKey(streamPath, String(m.AttachmentId))));
		await Promise.all(metas.map((m) =>
			this.nosql.deleteItem(ATTACHMENTS_TABLE, { partition: streamPath, sort: String(m.AttachmentId) })));
	}
}
