import type { MySubscriptionDto, PlanDto, ProjectDto, TeamMemberDto } from '@planpilot/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspacePage from './WorkspacePage';

// vi.mock factories are hoisted above the imports, so everything they use lives here.
const mocks = vi.hoisted(() => ({
  sub: undefined as MySubscriptionDto | undefined,
  plans: [] as PlanDto[],
  projects: [] as ProjectDto[],
  team: [] as TeamMemberDto[],
  createProject: vi.fn(),
  query: <T,>(data: T) => ({ data, isError: false, isFetching: false, refetch: vi.fn() }),
  idle: () => [vi.fn(), { isLoading: false }],
}));

vi.mock('../subscription/subscriptionApi', () => ({
  useMySubscriptionQuery: () => mocks.query(mocks.sub),
  usePlansQuery: () => ({ data: mocks.plans, isLoading: false }),
}));

vi.mock('./workspaceApi', () => ({
  useProjectsQuery: () => mocks.query(mocks.projects),
  useTeamQuery: () => mocks.query(mocks.team),
  useCreateProjectMutation: () => [mocks.createProject, { isLoading: false }],
  useUpdateProjectMutation: mocks.idle,
  useDeleteProjectMutation: mocks.idle,
  useAddTeamMemberMutation: mocks.idle,
  useRemoveTeamMemberMutation: mocks.idle,
}));

const plan = (slug: string, name: string, tier: number, projects: number | null): PlanDto => ({
  id: slug,
  name,
  slug,
  description: '',
  price: tier * 29_900,
  currency: 'INR',
  durationDays: 30,
  features: [],
  limits: { projects, teamMembers: tier * 2 },
  tier,
  isPopular: false,
  isActive: true,
});
const starter = plan('starter', 'Starter', 1, 3);
const pro = plan('pro', 'Pro', 2, 25);

const NOW = '2026-10-16T09:00:00.000Z';

function subscription(overrides: Partial<MySubscriptionDto> = {}): MySubscriptionDto {
  return {
    status: 'active',
    subscription: {
      id: 'sub-1',
      plan: starter,
      status: 'active',
      startDate: NOW,
      endDate: NOW,
      amountPaid: 29_900,
      changeType: 'new',
      cancelledAt: null,
      daysLeft: 20,
      totalDays: 30,
      adjustments: [],
      createdAt: NOW,
    },
    lastSubscription: null,
    usage: { projects: 1, teamMembers: 0 },
    limits: { projects: 3, teamMembers: 2 },
    readOnly: false,
    ...overrides,
  };
}

const project: ProjectDto = {
  id: 'p1',
  name: 'Website redesign',
  description: 'New landing pages',
  color: 'emerald',
  createdAt: NOW,
};

function renderPage(path = '/workspace') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspacePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.sub = subscription();
  mocks.plans = [starter, pro];
  mocks.projects = [project];
  mocks.team = [];
  mocks.createProject.mockReset();
});

describe('WorkspacePage', () => {
  it('shows usage and the remaining slots on the create button', () => {
    renderPage();
    expect(screen.getByText('Website redesign')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New project · 2 left/ })).toBeInTheDocument();
    expect(screen.getByText('2 projects left on Starter')).toBeInTheDocument();
  });

  it('opens the limit dialog instead of the form when the plan is full', async () => {
    mocks.sub = subscription({ usage: { projects: 3, teamMembers: 0 } });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /New project · 0 left/ }));
    const dialog = await screen.findByRole('dialog', { name: "You've reached your Starter limit" });
    expect(within(dialog).getByText('With Pro')).toBeInTheDocument();
    expect(within(dialog).getByText('25 projects')).toBeInTheDocument();
  });

  it('validates, then creates a project with the cleaned values', async () => {
    mocks.createProject.mockReturnValue({ unwrap: () => Promise.resolve(project) });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /New project/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    expect(await within(dialog).findByText('Project name is required')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Project name'), '  Launch site ');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Rose' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    expect(mocks.createProject).toHaveBeenCalledWith({
      name: 'Launch site',
      description: '',
      color: 'rose',
    });
  });

  it('turns a PLAN_LIMIT_REACHED answer into the upgrade dialog', async () => {
    mocks.createProject.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 403,
          code: 'PLAN_LIMIT_REACHED',
          message: "You've reached the Starter limit of 3 projects.",
          details: [],
          meta: { key: 'projects', limit: 3, used: 3, plan: 'Starter' },
        }),
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /New project/ }));
    const form = await screen.findByRole('dialog', { name: 'New project' });
    await userEvent.type(within(form).getByLabelText('Project name'), 'One too many');
    await userEvent.click(within(form).getByRole('button', { name: 'Create project' }));
    expect(
      await screen.findByRole('dialog', { name: "You've reached your Starter limit" }),
    ).toBeInTheDocument();
  });

  it('locks a workspace without an active plan', async () => {
    mocks.sub = subscription({
      status: 'expired',
      subscription: null,
      readOnly: true,
      limits: { projects: 0, teamMembers: 0 },
    });
    renderPage();
    expect(
      screen.getByText('Renew a plan to add or edit projects.', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('Read-only', { selector: 'span' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(
      await screen.findByRole('dialog', { name: 'Your workspace is read-only' }),
    ).toBeInTheDocument();
  });

  it('explains when usage is over the plan after a downgrade', () => {
    mocks.sub = subscription({ usage: { projects: 5, teamMembers: 0 } });
    renderPage();
    expect(screen.getByText("You're over your plan's limit")).toBeInTheDocument();
    expect(
      screen.getByText(/can't add more projects until you're under 3/, { exact: false }),
    ).toBeInTheDocument();
  });

  it('shows empty states for projects and the team tab', () => {
    mocks.projects = [];
    renderPage();
    expect(screen.getByText('No projects yet')).toBeInTheDocument();

    renderPage('/workspace?tab=team');
    expect(screen.getByText('No team members yet')).toBeInTheDocument();
  });
});
