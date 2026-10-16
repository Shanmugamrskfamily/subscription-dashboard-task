import type { ProjectDto, ProjectInput, TeamMemberDto, TeamMemberInput } from '@planpilot/shared';
import { api } from '../../api/apiSlice';

export const workspaceApi = api.injectEndpoints({
  endpoints: (build) => ({
    projects: build.query<ProjectDto[], void>({
      query: () => ({ url: '/projects' }),
      providesTags: ['Projects'],
    }),
    createProject: build.mutation<ProjectDto, ProjectInput>({
      query: (body) => ({ url: '/projects', method: 'POST', body }),
      invalidatesTags: ['Projects', 'MySubscription', 'Notifications'],
    }),
    updateProject: build.mutation<ProjectDto, { id: string; body: ProjectInput }>({
      query: ({ id, body }) => ({ url: `/projects/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Projects'],
    }),
    deleteProject: build.mutation<{ deleted: boolean }, string>({
      query: (id) => ({ url: `/projects/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Projects', 'MySubscription'],
    }),
    team: build.query<TeamMemberDto[], void>({
      query: () => ({ url: '/team' }),
      providesTags: ['Team'],
    }),
    addTeamMember: build.mutation<TeamMemberDto, TeamMemberInput>({
      query: (body) => ({ url: '/team', method: 'POST', body }),
      invalidatesTags: ['Team', 'MySubscription', 'Notifications'],
    }),
    removeTeamMember: build.mutation<{ deleted: boolean }, string>({
      query: (id) => ({ url: `/team/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Team', 'MySubscription'],
    }),
  }),
});

export const {
  useProjectsQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useTeamQuery,
  useAddTeamMemberMutation,
  useRemoveTeamMemberMutation,
} = workspaceApi;
