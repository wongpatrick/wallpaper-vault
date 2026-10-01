/**
 * @file
 * Module: Rotation Form Provider Component
 * Description: React provider wrapping rotation configuration children.
 */
import { RotationFormContext, type RotationFormContextValue } from './RotationFormContext';

export interface RotationFormProviderProps {
    value: RotationFormContextValue;
    children: React.ReactNode;
}

export function RotationFormProvider({ value, children }: RotationFormProviderProps) {
    return (
        <RotationFormContext.Provider value={value}>
            {children}
        </RotationFormContext.Provider>
    );
}
