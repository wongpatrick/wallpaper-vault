/**
 * @file
 * Module: Profile Manager Card Component
 * Description: Renders saved configuration profile selector, save/apply/delete actions, and save profile modal.
 */
import { Paper, Stack, Select, Group, Button, ActionIcon, Modal, TextInput } from '@mantine/core';
import { IconDeviceFloppy, IconTrash } from '@tabler/icons-react';
import { useRotationFormContext } from '../context/RotationFormContext';

export function ProfileManagerCard() {
    const {
        profiles,
        selectedProfileId,
        setSelectedProfileId,
        saveModalOpen,
        setSaveModalOpen,
        newProfileName,
        setNewProfileName,
        savingProfile,
        applyingProfile,
        deletingProfile,
        handleSaveProfile,
        handleApplyProfile,
        handleDeleteProfile
    } = useRotationFormContext();

    return (
        <>
            <Paper withBorder p="md" radius="md">
                <Stack gap="sm">
                    <Select
                        label="Saved Profiles"
                        placeholder={profiles && profiles.length > 0 ? "Select a profile..." : "No profiles saved yet"}
                        data={profiles?.map(p => ({ value: String(p.id), label: p.name })) || []}
                        value={selectedProfileId}
                        onChange={setSelectedProfileId}
                        disabled={!profiles || profiles.length === 0}
                    />
                    <Group gap="xs" wrap="nowrap">
                        <Button
                            variant="filled"
                            color="green"
                            leftSection={<IconDeviceFloppy size="1rem" />}
                            onClick={() => setSaveModalOpen(true)}
                            style={{ flex: 1 }}
                        >
                            Save Current Settings
                        </Button>
                        <Button
                            variant="light"
                            color="blue"
                            disabled={!selectedProfileId}
                            loading={applyingProfile}
                            onClick={handleApplyProfile}
                            style={{ flex: 1 }}
                        >
                            Apply Profile
                        </Button>
                        <ActionIcon
                            variant="light"
                            color="red"
                            size="lg"
                            disabled={!selectedProfileId}
                            loading={deletingProfile}
                            onClick={handleDeleteProfile}
                            title="Delete Profile"
                        >
                            <IconTrash size="1.2rem" />
                        </ActionIcon>
                    </Group>
                </Stack>
            </Paper>

            <Modal
                opened={saveModalOpen}
                onClose={() => {
                    setSaveModalOpen(false);
                    setNewProfileName('');
                }}
                title="Save Settings Profile"
                centered
            >
                <Stack gap="md">
                    <TextInput
                        label="Profile Name"
                        placeholder="e.g. Gaming Mode, Work Mode"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.currentTarget.value)}
                        required
                        data-autofocus
                    />
                    <Group justify="flex-end" gap="xs">
                        <Button variant="subtle" onClick={() => setSaveModalOpen(false)}>Cancel</Button>
                        <Button color="blue" onClick={handleSaveProfile} loading={savingProfile}>Save Profile</Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}
