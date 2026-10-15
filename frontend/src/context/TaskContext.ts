/**
 * @file
 * Module: Task Context
 * Description: Defines the types and React Context for tracking global background tasks in the application.
 */
import { createContext } from 'react';

import { TaskStatus } from '../types/enums';

export interface BaseTaskInfo {
    id: string;
    progress: number;
    total: number;
    updated_at?: string;
}

export interface AcceptedTaskInfo extends BaseTaskInfo {
    status: typeof TaskStatus.ACCEPTED;
    error_message?: null;
}

export interface ProcessingTaskInfo extends BaseTaskInfo {
    status: typeof TaskStatus.PROCESSING;
    error_message?: null;
}

export interface CompletedTaskInfo extends BaseTaskInfo {
    status: typeof TaskStatus.COMPLETED;
    error_message?: string | null;
}

export interface ErrorTaskInfo extends BaseTaskInfo {
    status: typeof TaskStatus.ERROR;
    error_message: string;
}

export type TaskInfo =
    | AcceptedTaskInfo
    | ProcessingTaskInfo
    | CompletedTaskInfo
    | ErrorTaskInfo;

export interface TaskContextType {
    tasks: Record<string, TaskInfo>;
    getTaskForSet: (setId: number) => TaskInfo | undefined;
    isTaskRunning: boolean;
    addTask: (task: TaskInfo) => void;
}

export const TaskContext = createContext<TaskContextType | undefined>(undefined);
