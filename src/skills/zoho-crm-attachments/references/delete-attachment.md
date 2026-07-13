# Delete Attachment

`DELETE /crm/v8/{module}/{id}/Attachments/{attachment_id}`

Deletes a specific file attachment from a CRM record.

## Parameters

| Name | Required | Description |
|---|---|---|
| module | yes | CRM module API name, in path |
| id | yes | The record ID, in path |
| attachment_id | yes | The attachment ID to delete, in path |

## Response

`200` on success, with `data[]` containing `code: SUCCESS`, `message: "record deleted"`, and `details.id`.

Deleting an already-deleted attachment ID returns `500 INTERNAL_ERROR` (`message: "File not deleted"`). Deleting an attachment ID that never existed on the record returns `400 INVALID_DATA` (`message: "record not deleted"`).

## Scopes

`ZohoCRM.modules.attachments.DELETE`

## Notes

- Mutating and destructive — requires HITL approval. Decision options restricted to approve / reject (no edit).
