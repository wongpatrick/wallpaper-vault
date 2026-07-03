/**
 * @file
 * Global search bar component.
 * Provides fuzzy, category-grouped search results with responsive mobile modal support and keyboard navigation.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    Combobox, 
    TextInput, 
    useCombobox, 
    Box, 
    Group, 
    ActionIcon, 
    Modal, 
    ThemeIcon, 
    Text, 
    Loader, 
    CloseButton,
    Tooltip
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { 
    IconSearch, 
    IconStack, 
    IconBrush, 
    IconTag, 
    IconMovie, 
    IconUser 
} from '@tabler/icons-react';
import { useSearchAllApiSearchGet } from '../../api/generated/search/search';
import type { SearchResultItem } from '../../api/model';
import { getLabelFromPath } from '../../utils/navigationUtils';

interface SearchInputProps {
    query: string;
    setQuery: (val: string) => void;
    debouncedQuery: string;
    onClose?: () => void;
    autoFocus?: boolean;
}

function SearchInput({ query, setQuery, debouncedQuery, onClose, autoFocus = false }: SearchInputProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const inputRef = useRef<HTMLInputElement>(null);
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
    });

    const isQueryValid = debouncedQuery.trim().length >= 1;

    const { data, isLoading } = useSearchAllApiSearchGet(
        { q: debouncedQuery },
        { query: { enabled: isQueryValid } }
    );

    const handleOptionSubmit = (val: string) => {
        const [type, id] = val.split(':');
        const matched = data?.find(item => item.type === type && String(item.id) === id);
        if (!matched) return;

        setQuery('');
        combobox.closeDropdown();
        if (onClose) {
            onClose();
        }

        const navState = {
            from: location.pathname,
            fromLabel: getLabelFromPath(location.pathname)
        };

        if (type === 'set') {
            navigate(`/sets/${matched.id}`, { state: navState });
        } else if (type === 'creator') {
            navigate(`/creators/${matched.id}`, { state: navState });
        } else if (type === 'character') {
            navigate(`/images?character=${encodeURIComponent(matched.name)}`, { state: navState });
        } else if (type === 'franchise') {
            navigate(`/images?franchise=${encodeURIComponent(matched.name)}`, { state: navState });
        } else if (type === 'tag') {
            navigate(`/images?tag=${encodeURIComponent(matched.name)}`, { state: navState });
        }
    };

    const renderOption = (item: SearchResultItem) => {
        let Icon = IconTag;
        let iconColor = 'gray';
        if (item.type === 'set') {
            Icon = IconStack;
            iconColor = 'blue';
        } else if (item.type === 'creator') {
            Icon = IconBrush;
            iconColor = 'violet';
        } else if (item.type === 'character') {
            Icon = IconUser;
            iconColor = 'teal';
        } else if (item.type === 'franchise') {
            Icon = IconMovie;
            iconColor = 'orange';
        } else if (item.type === 'tag') {
            Icon = IconTag;
            iconColor = 'pink';
        }

        return (
            <Combobox.Option value={`${item.type}:${item.id}`} key={`${item.type}:${item.id}`}>
                <Group wrap="nowrap" gap="sm">
                    <ThemeIcon variant="light" color={iconColor} size="sm" radius="sm">
                        <Icon size={14} />
                    </ThemeIcon>
                    <div style={{ flex: 1 }}>
                        <Text size="sm" fw={500} lineClamp={1}>{item.name}</Text>
                        {item.detail && (
                            <Text size="xs" c="dimmed" lineClamp={1}>{item.detail}</Text>
                        )}
                    </div>
                </Group>
            </Combobox.Option>
        );
    };

    const groupedOptions = useMemo(() => {
        if (!data || data.length === 0) return null;

        const sets = data.filter(item => item.type === 'set').map(renderOption);
        const creators = data.filter(item => item.type === 'creator').map(renderOption);
        const characters = data.filter(item => item.type === 'character').map(renderOption);
        const franchises = data.filter(item => item.type === 'franchise').map(renderOption);
        const tags = data.filter(item => item.type === 'tag').map(renderOption);

        return (
            <>
                {sets.length > 0 && (
                    <Combobox.Group label="Sets">
                        {sets}
                    </Combobox.Group>
                )}
                {creators.length > 0 && (
                    <Combobox.Group label="Creators">
                        {creators}
                    </Combobox.Group>
                )}
                {characters.length > 0 && (
                    <Combobox.Group label="Characters">
                        {characters}
                    </Combobox.Group>
                )}
                {franchises.length > 0 && (
                    <Combobox.Group label="Franchises">
                        {franchises}
                    </Combobox.Group>
                )}
                {tags.length > 0 && (
                    <Combobox.Group label="Tags">
                        {tags}
                    </Combobox.Group>
                )}
            </>
        );
    }, [data]);

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus]);

    const isMac = typeof window !== 'undefined' && window.navigator.userAgent.includes('Mac');
    const shortcutLabel = isMac ? '⌘K' : 'Ctrl+K';

    return (
        <Combobox
            store={combobox}
            onOptionSubmit={handleOptionSubmit}
            withinPortal={true}
        >
            <Combobox.Target>
                <TextInput
                    ref={inputRef}
                    placeholder="Search sets, creators, tags..."
                    value={query}
                    onChange={(event) => {
                        setQuery(event.currentTarget.value);
                        combobox.openDropdown();
                        combobox.updateSelectedOptionIndex();
                    }}
                    onClick={() => combobox.openDropdown()}
                    onFocus={() => combobox.openDropdown()}
                    onBlur={() => combobox.closeDropdown()}
                    leftSection={<IconSearch size={16} stroke={1.5} />}
                    rightSection={
                        isLoading ? (
                            <Loader size="xs" />
                        ) : query ? (
                            <CloseButton
                                size="sm"
                                onClick={() => {
                                    setQuery('');
                                    inputRef.current?.focus();
                                }}
                            />
                        ) : (
                            <Text size="xs" c="dimmed" style={{ pointerEvents: 'none', userSelect: 'none' }} pr="xs">
                                {shortcutLabel}
                            </Text>
                        )
                    }
                />
            </Combobox.Target>

            {isQueryValid && (
                <Combobox.Dropdown>
                    <Combobox.Options>
                        {groupedOptions ? (
                            groupedOptions
                        ) : (
                            !isLoading && (
                                <Box py="xs" px="md">
                                    <Text size="sm" c="dimmed" ta="center">
                                        No results found for "{debouncedQuery}"
                                    </Text>
                                </Box>
                            )
                        )}
                    </Combobox.Options>
                </Combobox.Dropdown>
            )}
        </Combobox>
    );
}

const DEBOUNCE_DELAY_MS = 250;
const MOBILE_BREAKPOINT_PX = 768;

export default function GlobalSearch() {
    const [opened, setOpened] = useState(false);
    const [query, setQuery] = useState('');
    const [debouncedQuery] = useDebouncedValue(query, DEBOUNCE_DELAY_MS);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                // Check if search modal is already open
                const isMobile = window.innerWidth < MOBILE_BREAKPOINT_PX; // sm breakpoint in Mantine is 768px (48em)
                if (isMobile) {
                    setOpened(true);
                } else {
                    const inputElement = document.querySelector('input[placeholder="Search sets, creators, tags..."]') as HTMLInputElement;
                    if (inputElement) {
                        inputElement.focus();
                        inputElement.select();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <>
            {/* Desktop View */}
            <Box visibleFrom="sm" style={{ width: 320, zIndex: 100 }}>
                <SearchInput 
                    query={query} 
                    setQuery={setQuery} 
                    debouncedQuery={debouncedQuery} 
                />
            </Box>

            {/* Mobile View */}
            <Box hiddenFrom="sm">
                <Tooltip label="Search (Ctrl+K)">
                    <ActionIcon 
                        variant="subtle" 
                        color="gray" 
                        size="md" 
                        radius="md"
                        onClick={() => setOpened(true)}
                    >
                        <IconSearch size={18} stroke={1.5} />
                    </ActionIcon>
                </Tooltip>

                <Modal
                    opened={opened}
                    onClose={() => {
                        setOpened(false);
                        setQuery('');
                    }}
                    title="Search Library"
                    size="lg"
                    padding="md"
                    centered
                >
                    <Box py="xs">
                        <SearchInput 
                            query={query} 
                            setQuery={setQuery} 
                            debouncedQuery={debouncedQuery} 
                            onClose={() => setOpened(false)}
                            autoFocus
                        />
                    </Box>
                </Modal>
            </Box>
        </>
    );
}
