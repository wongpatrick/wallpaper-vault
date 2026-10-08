/**
 * @file
 * Module: useImageEditForm Hook
 * Description: Manages form state, dirty checking, save mutation, and discard confirmations for image metadata editing.
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useUpdateImageApiImagesImageIdPatch, useReadImageApiImagesImageIdGet } from '../../../api/generated/images/images';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import type { Image as ImageModel, ImageUpdate, ImageDetail } from '../../../api/model';
import { ImageRating } from '../../../types/enums';

const CONFIRM_MODAL_Z_INDEX_OFFSET = 10;
const DEFAULT_MODAL_Z_INDEX = 3000;

export interface UseImageEditFormOptions {
    image: ImageModel | null;
    opened?: boolean;
    onClose: () => void;
    onUpdated: () => void;
    zIndex?: number;
}

export function useImageEditForm({
    image,
    onClose,
    onUpdated,
    zIndex = DEFAULT_MODAL_Z_INDEX
}: UseImageEditFormOptions) {
    const { showNotification } = useAppNotifications();
    const updateMutation = useUpdateImageApiImagesImageIdPatch();

    const { data: imageDetail } = useReadImageApiImagesImageIdGet(
        image?.id || 0,
        undefined,
        { query: { enabled: !!image?.id } }
    );

    const [form, setForm] = useState<ImageUpdate>({
        filename: '',
        notes: '',
        sort_order: 0,
        aspect_ratio_label: '',
        rating: ImageRating.SAFE,
        dominant_color: '',
        tags: [],
        characters: []
    });

    const [prevImageId, setPrevImageId] = useState<number | null>(null);
    if (image && image.id !== prevImageId) {
        setPrevImageId(image.id);
        setForm({
            filename: image.filename || '',
            notes: image.notes || '',
            sort_order: image.sort_order || 0,
            aspect_ratio_label: image.aspect_ratio_label || '',
            rating: image.rating || ImageRating.SAFE,
            dominant_color: image.dominant_color || '',
            tags: (image as ImageDetail).tags || [],
            characters: (image as ImageDetail).characters || []
        });
    }

    // Update tags and characters form fields once detailed image metadata is loaded
    useEffect(() => {
        if (imageDetail) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setForm(prev => ({
                ...prev,
                tags: imageDetail.tags || [],
                characters: imageDetail.characters || []
            }));
        }
    }, [imageDetail]);

    const isFormDirty = useMemo(() => {
        if (!image) return false;
        const originalTags = (image as ImageDetail).tags || [];
        const originalCharacters = (image as ImageDetail).characters || [];

        const arraysEqual = (a: string[], b: string[]) => {
            if (a.length !== b.length) return false;
            const sortedA = [...a].sort();
            const sortedB = [...b].sort();
            return sortedA.every((val, idx) => val === sortedB[idx]);
        };

        return (
            form.filename !== (image.filename || '') ||
            form.notes !== (image.notes || '') ||
            form.sort_order !== (image.sort_order || 0) ||
            form.aspect_ratio_label !== (image.aspect_ratio_label || '') ||
            form.rating !== (image.rating || ImageRating.SAFE) ||
            form.dominant_color !== (image.dominant_color || '') ||
            !arraysEqual(form.tags || [], originalTags) ||
            !arraysEqual(form.characters || [], originalCharacters)
        );
    }, [form, image]);

    const resetForm = useCallback(() => {
        if (image) {
            setForm({
                filename: image.filename || '',
                notes: image.notes || '',
                sort_order: image.sort_order || 0,
                aspect_ratio_label: image.aspect_ratio_label || '',
                rating: image.rating || ImageRating.SAFE,
                dominant_color: image.dominant_color || '',
                tags: (image as ImageDetail).tags || [],
                characters: (image as ImageDetail).characters || []
            });
        }
    }, [image]);

    const setField = useCallback(<K extends keyof ImageUpdate>(key: K, value: ImageUpdate[K]) => {
        setForm(prev => ({ ...prev, [key]: value }));
    }, []);

    const handleClose = useCallback(() => {
        if (isFormDirty) {
            modals.openConfirmModal({
                title: 'Unsaved Changes',
                centered: true,
                zIndex: zIndex + CONFIRM_MODAL_Z_INDEX_OFFSET,
                children: (
                    <Text size="sm">
                        You have unsaved changes. Do you want to discard them?
                    </Text>
                ),
                labels: { confirm: 'Discard Changes', cancel: 'Keep Editing' },
                confirmProps: { color: 'red' },
                onConfirm: () => {
                    resetForm();
                    onClose();
                }
            });
        } else {
            onClose();
        }
    }, [isFormDirty, zIndex, resetForm, onClose]);

    const handleSave = useCallback(async () => {
        if (!image) return;
        try {
            await updateMutation.mutateAsync({
                imageId: image.id,
                data: form
            });
            showNotification({ title: 'Success', message: 'Image updated', color: 'green' });
            onUpdated();
            onClose();
        } catch {
            showNotification({ title: 'Error', message: 'Could not update image', color: 'red' });
        }
    }, [image, form, updateMutation, showNotification, onUpdated, onClose]);

    return {
        form,
        setForm,
        setField,
        isFormDirty,
        isSaving: updateMutation.isPending,
        resetForm,
        handleClose,
        handleSave,
        imageDetail
    };
}
