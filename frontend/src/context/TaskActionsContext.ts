/**
 * @file
 * Module: Task Actions Context
 * Description: React context for dispatching background tasks without subscribing to progress updates.
 */
import { createContext } from 'react';
import type { TaskInfo } from './TaskContext';

export interface TaskActionsContextType {
    addTask: (task: TaskInfo) => void;
}

export const TaskActionsContext = createContext<TaskActionsContextType | undefined>(undefined);
