/**
 * @file Taxonomy Management Page
 */
import { Container, Title, Tabs, Group } from '@mantine/core';
import { CharactersTab } from './components/CharactersTab';
import { FranchisesTab } from './components/FranchisesTab';
import { TagsTab } from './components/TagsTab';

export default function TaxonomyManagement() {
    return (
        <Container fluid px="xl">
            <Group justify="space-between" mb="lg">
                <Title order={2}>Taxonomy Management</Title>
            </Group>

            <Tabs defaultValue="characters">
                <Tabs.List mb="md">
                    <Tabs.Tab value="characters">Characters</Tabs.Tab>
                    <Tabs.Tab value="franchises">Franchises</Tabs.Tab>
                    <Tabs.Tab value="tags">Tags</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="characters">
                    <CharactersTab />
                </Tabs.Panel>

                <Tabs.Panel value="franchises">
                    <FranchisesTab />
                </Tabs.Panel>

                <Tabs.Panel value="tags">
                    <TagsTab />
                </Tabs.Panel>
            </Tabs>
        </Container>
    );
}
