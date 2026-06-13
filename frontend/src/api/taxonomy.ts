/**
 * @file API client methods and React Query hooks for managing characters and franchises.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customInstance } from './axios-instance';

// --- Models ---
export interface Tag {
  id: number;
  name: string;
  set_count?: number;
}

export interface TagUpdate {
  name: string;
}

export interface Franchise {
  id: number;
  name: string;
  set_count?: number;
}

export interface FranchiseCreate {
  name: string;
}

export interface FranchiseUpdate {
  name?: string;
}

export interface Character {
  id: number;
  name: string;
  franchise_id?: number;
  franchise?: Franchise;
  set_count?: number;
}

export interface CharacterCreate {
  name: string;
  franchise_id?: number;
}

export interface CharacterUpdate {
  name?: string;
  franchise_id?: number;
}

// --- Characters API ---

export const readCharacters = (skip = 0, limit = 100, signal?: AbortSignal) => {
  return customInstance<Character[]>({ url: `/api/characters/`, method: 'GET', params: { skip, limit }, signal });
};

export const createCharacter = (data: CharacterCreate) => {
  return customInstance<Character>({ url: `/api/characters/`, method: 'POST', data });
};

export const updateCharacter = (id: number, data: CharacterUpdate) => {
  return customInstance<Character>({ url: `/api/characters/${id}`, method: 'PATCH', data });
};

export const deleteCharacter = (id: number) => {
  return customInstance<void>({ url: `/api/characters/${id}`, method: 'DELETE' });
};

// --- Franchises API ---

export const readFranchises = (skip = 0, limit = 100, signal?: AbortSignal) => {
  return customInstance<Franchise[]>({ url: `/api/franchises/`, method: 'GET', params: { skip, limit }, signal });
};

export const createFranchise = (data: FranchiseCreate) => {
  return customInstance<Franchise>({ url: `/api/franchises/`, method: 'POST', data });
};

export const updateFranchise = (id: number, data: FranchiseUpdate) => {
  return customInstance<Franchise>({ url: `/api/franchises/${id}`, method: 'PATCH', data });
};

export const deleteFranchise = (id: number) => {
  return customInstance<void>({ url: `/api/franchises/${id}`, method: 'DELETE' });
};

// --- Hooks ---

export const useReadCharacters = (skip = 0, limit = 100) => {
  return useQuery({
    queryKey: ['characters', skip, limit],
    queryFn: ({ signal }) => readCharacters(skip, limit, signal),
  });
};

export const useCreateCharacter = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCharacter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['sets'] });
      queryClient.invalidateQueries({ queryKey: ['images'] });
    },
  });
};

export const useUpdateCharacter = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CharacterUpdate }) => updateCharacter(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['sets'] });
      queryClient.invalidateQueries({ queryKey: ['images'] });
    },
  });
};

export const useDeleteCharacter = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCharacter,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['characters'] }),
  });
};

export const useReadFranchises = (skip = 0, limit = 100) => {
  return useQuery({
    queryKey: ['franchises', skip, limit],
    queryFn: ({ signal }) => readFranchises(skip, limit, signal),
  });
};

export const useCreateFranchise = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createFranchise,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['franchises'] }),
  });
};

export const useUpdateFranchise = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FranchiseUpdate }) => updateFranchise(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['franchises'] }),
  });
};

export const useDeleteFranchise = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteFranchise(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['franchises'] });
    },
  });
};

// --- Tags API ---

export const readTagsManagement = (skip = 0, limit = 100, signal?: AbortSignal) => {
  return customInstance<Tag[]>({ url: `/api/tags/management`, method: 'GET', params: { skip, limit }, signal });
};

export const updateTag = (id: number, data: TagUpdate) => {
  return customInstance<Tag>({ url: `/api/tags/${id}`, method: 'PATCH', data });
};

export const deleteTag = (id: number) => {
  return customInstance<void>({ url: `/api/tags/${id}`, method: 'DELETE' });
};

export const useReadTagsManagement = (skip = 0, limit = 100) => {
  return useQuery({
    queryKey: ['tags', skip, limit],
    queryFn: ({ signal }) => readTagsManagement(skip, limit, signal),
  });
};

export const useUpdateTag = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TagUpdate }) => updateTag(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
};

export const useDeleteTag = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
};
