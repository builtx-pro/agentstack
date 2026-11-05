// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ProjectObject } from '@shared/api/schemas';
import { ProjectResources } from './project-resources.component';

Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
afterEach(cleanup);
const resource = (id: string, overrides: Partial<ProjectObject> = {}): ProjectObject => ({
  id, projectId: 'project', key: id, kind: 'document', title: id, description: 'Project reference',
  tags: ['project-resource'], visibility: 'customer', status: 'ready', archived: false, version: 1,
  data: { markdown: '[Open](https://example.com)' }, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...overrides,
});
const mount = (objects: ProjectObject[], onOpen = vi.fn()) => render(createElement(MantineProvider, { env: 'test' }, createElement(ProjectResources, { objects, onOpen })));

describe('project resource navigation', () => {
  it('hides the whole section without active tagged documents', () => {
    mount([resource('archived', { archived: true }), resource('screen', { kind: 'screen' }), resource('ordinary', { tags: [] })]);
    expect(screen.queryByRole('heading', { name: 'Project resources' })).toBeNull();
  });
  it('shows active documents in title order and opens the exact selected object', () => {
    const onOpen = vi.fn();
    const objects = [resource('z', { title: 'Presentations' }), resource('a', { title: '3D studio', tags: ['project-resource', 'Tools'] }), resource('hidden', { archived: true })];
    mount(objects, onOpen);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map(button => button.textContent)).toEqual(['Open 3D studio', 'Open Presentations']);
    expect(screen.queryByText('hidden')).toBeNull();
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.queryByText('project-resource')).toBeNull();
    fireEvent.click(buttons[0]);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('a');
    expect(objects[0].id).toBe('z');
    expect(document.querySelector('iframe')).toBeNull();
  });
});
