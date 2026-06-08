/*
  Warnings:

  - You are about to drop the column `assigned_to` on the `task` table. All the data in the column will be lost.
  - Changed the type of `entity_type` on the `activity_log` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `file_key` to the `attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `file_size` to the `attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mime_type` to the `attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `comment` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `notification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `entity_type` on the `notification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('LEAD', 'MEMBER');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('TASK', 'PROJECT', 'COMMENT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_UNASSIGNED', 'TASK_STATUS_CHANGED', 'TASK_OVERDUE', 'TASK_DUE_SOON', 'COMMENT_ADDED', 'COMMENT_MENTION', 'PROJECT_MEMBER_ADDED', 'PROJECT_MEMBER_REMOVED', 'PROJECT_STATUS_CHANGED', 'PROJECT_DEADLINE_APPROACHING', 'ATTACHMENT_UPLOADED');

-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('TASK', 'PROJECT', 'COMMENT', 'ATTACHMENT');

-- DropForeignKey
ALTER TABLE "task" DROP CONSTRAINT "task_assigned_to_fkey";

-- AlterTable
ALTER TABLE "activity_log" ADD COLUMN     "project_id" TEXT,
DROP COLUMN "entity_type",
ADD COLUMN     "entity_type" "ActivityEntityType" NOT NULL;

-- AlterTable
ALTER TABLE "attachment" ADD COLUMN     "file_key" TEXT NOT NULL,
ADD COLUMN     "file_size" INTEGER NOT NULL,
ADD COLUMN     "mime_type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "comment" ADD COLUMN     "is_edited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "actor_id" TEXT,
ADD COLUMN     "archived_at" TIMESTAMP(3),
DROP COLUMN "type",
ADD COLUMN     "type" "NotificationType" NOT NULL,
DROP COLUMN "entity_type",
ADD COLUMN     "entity_type" "NotificationEntityType" NOT NULL;

-- AlterTable
ALTER TABLE "project_member" ADD COLUMN     "role" "ProjectMemberRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "task" DROP COLUMN "assigned_to",
ADD COLUMN     "column_id" TEXT,
ADD COLUMN     "estimated_minutes" INTEGER,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "skills" TEXT[];

-- CreateTable
CREATE TABLE "comment_version" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_column" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "mapped_status" "TaskStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_column_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignee" (
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignee_pkey" PRIMARY KEY ("task_id","user_id")
);

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_version" ADD CONSTRAINT "comment_version_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_column" ADD CONSTRAINT "board_column_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "board_column"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
