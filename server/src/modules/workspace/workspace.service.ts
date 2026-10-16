import type {
  ProjectDto,
  ProjectInput,
  TeamMemberDto,
  TeamMemberInput,
  TeamRole,
} from '@planpilot/shared';
import { ERROR_CODES } from '@planpilot/shared';
import { ApiError } from '../../utils/api-error';
import { ProjectModel, TeamMemberModel } from './workspace.models';
import type { Project, TeamMember } from './workspace.models';
import { releaseUsage, requireActivePlan, reserveUsage } from './usage.service';

const toProject = (p: Project): ProjectDto => ({
  id: p._id.toString(),
  name: p.name,
  description: p.description ?? '',
  color: p.color ?? 'indigo',
  createdAt: new Date(p.createdAt).toISOString(),
});

const toMember = (m: TeamMember): TeamMemberDto => ({
  id: m._id.toString(),
  name: m.name,
  email: m.email,
  role: m.role as TeamRole,
  createdAt: new Date(m.createdAt).toISOString(),
});

export async function listProjects(userId: string): Promise<ProjectDto[]> {
  const rows = await ProjectModel.find({ ownerId: userId })
    .sort({ createdAt: -1 })
    .lean<Project[]>();
  return rows.map(toProject);
}

export async function createProject(userId: string, input: ProjectInput): Promise<ProjectDto> {
  await reserveUsage(userId, 'projects');
  try {
    const project = await ProjectModel.create({ ...input, ownerId: userId });
    return toProject(project.toObject());
  } catch (error) {
    await releaseUsage(userId, 'projects'); // give the reserved slot back
    throw error;
  }
}

export async function updateProject(
  userId: string,
  id: string,
  input: ProjectInput,
): Promise<ProjectDto> {
  await requireActivePlan(userId);
  const project = await ProjectModel.findOneAndUpdate({ _id: id, ownerId: userId }, input, {
    new: true,
  }).lean<Project>();
  if (!project) throw ApiError.notFound('Project not found');
  return toProject(project);
}

/** Deleting stays allowed without a plan, so users can get back under a lower limit. */
export async function deleteProject(userId: string, id: string): Promise<void> {
  const deleted = await ProjectModel.findOneAndDelete({ _id: id, ownerId: userId });
  if (!deleted) throw ApiError.notFound('Project not found');
  await releaseUsage(userId, 'projects');
}

export async function listTeam(userId: string): Promise<TeamMemberDto[]> {
  const rows = await TeamMemberModel.find({ ownerId: userId })
    .sort({ createdAt: -1 })
    .lean<TeamMember[]>();
  return rows.map(toMember);
}

export async function addTeamMember(
  userId: string,
  input: TeamMemberInput,
): Promise<TeamMemberDto> {
  if (await TeamMemberModel.exists({ ownerId: userId, email: input.email })) {
    throw ApiError.conflict('This person is already on your team.', ERROR_CODES.CONFLICT);
  }
  await reserveUsage(userId, 'teamMembers');
  try {
    const member = await TeamMemberModel.create({ ...input, ownerId: userId });
    return toMember(member.toObject());
  } catch (error) {
    await releaseUsage(userId, 'teamMembers');
    if ((error as { code?: number }).code === 11000) {
      throw ApiError.conflict('This person is already on your team.', ERROR_CODES.CONFLICT);
    }
    throw error;
  }
}

export async function removeTeamMember(userId: string, id: string): Promise<void> {
  const deleted = await TeamMemberModel.findOneAndDelete({ _id: id, ownerId: userId });
  if (!deleted) throw ApiError.notFound('Team member not found');
  await releaseUsage(userId, 'teamMembers');
}
