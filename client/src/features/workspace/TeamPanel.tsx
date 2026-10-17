import { ERROR_CODES, TEAM_ROLES, teamMemberSchema } from '@planpilot/shared';
import type { TeamMemberDto, TeamMemberInput, TeamRole } from '@planpilot/shared';
import { Form, Formik } from 'formik';
import type { FormikHelpers } from 'formik';
import { Eye, Lock, Pencil, UserMinus, UserPlus } from 'lucide-react';
import { motion } from 'motion/react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { errorOf } from '../../api/errors';
import type { AppError } from '../../api/errors';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { ResponsiveTable } from '../../components/ui/data';
import type { Column } from '../../components/ui/data';
import { Modal } from '../../components/ui/dialog';
import { Avatar, EmptyState } from '../../components/ui/feedback';
import {
  applyServerErrors,
  FocusFirstError,
  FormAlert,
  SelectField,
  TextField,
} from '../../components/ui/form';
import { formatDate, plural } from '../../lib/format';
import type { Usage } from './limits';
import { LoadError } from './LoadError';
import {
  useAddTeamMemberMutation,
  useRemoveTeamMemberMutation,
  useTeamQuery,
} from './workspaceApi';

const ROLES: Record<TeamRole, { label: string; hint: string; icon: typeof Eye }> = {
  viewer: { label: 'Viewer', hint: 'Can open and read your projects.', icon: Eye },
  editor: { label: 'Editor', hint: 'Can read and change your projects.', icon: Pencil },
};

function RoleBadge({ role }: { role: TeamRole }) {
  const { label, icon: Icon } = ROLES[role];
  return (
    <Badge tone={role === 'editor' ? 'brand' : 'neutral'}>
      <Icon className="size-3" aria-hidden /> {label}
    </Badge>
  );
}

function MemberCell({ member }: { member: TeamMemberDto }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={member.name} />
      <div className="min-w-0 sm:max-w-64 lg:max-w-xs">
        <p className="truncate font-extrabold">{member.name}</p>
        <p className="truncate text-[13px] text-muted" title={member.email}>
          {member.email}
        </p>
      </div>
    </div>
  );
}

interface Target {
  open: boolean;
  member: TeamMemberDto | null;
}

export function TeamPanel({
  usage,
  readOnly,
  createOpen,
  onCreateOpenChange,
  onCreate,
  onBlocked,
}: {
  usage: Usage | null;
  readOnly: boolean;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  /** Starts adding a member, checking the plan first. */
  onCreate: () => void;
  /** True when the error was a plan limit or read-only answer and is now shown. */
  onBlocked: (error: AppError) => boolean;
}) {
  const { data: team, isError, error, refetch, isFetching } = useTeamQuery();
  const [removing, setRemoving] = useState<Target>({ open: false, member: null });

  const columns: Column<TeamMemberDto>[] = [
    { key: 'member', header: 'Member', cell: (m) => <MemberCell member={m} /> },
    { key: 'role', header: 'Role', cell: (m) => <RoleBadge role={m.role} /> },
    {
      key: 'added',
      header: 'Added',
      hideBelow: 'md',
      cell: (m) => (
        <time dateTime={m.createdAt} className="num whitespace-nowrap text-muted">
          {formatDate(m.createdAt)}
        </time>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (m) => (
        <Button
          variant="danger-ghost"
          size="sm"
          className="-ml-3 h-11 sm:ml-0 sm:h-9"
          onClick={() => setRemoving({ open: true, member: m })}
          aria-label={`Remove ${m.name}`}
        >
          <UserMinus aria-hidden /> Remove
        </Button>
      ),
    },
  ];

  if (!team && isError) {
    return (
      <LoadError
        title="We couldn't load your team"
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <Card className="p-4 sm:p-5">
          <CardHeader
            title="Team members"
            description={
              team?.length
                ? `${plural(team.length, 'person', 'people')} can work on your projects.`
                : 'People you add can work on your projects.'
            }
          />
          <ResponsiveTable
            rows={team ?? []}
            columns={columns}
            rowKey={(m) => m.id}
            loading={!team}
            cardTitle={(m) => <MemberCell member={m} />}
            empty={
              <EmptyState
                illustration="emptyBox"
                title="No team members yet"
                description={
                  readOnly
                    ? 'Team seats come with a plan. Pick one to start adding people.'
                    : usage?.limit != null
                      ? `Add the people you work with. Your plan includes ${plural(usage.limit, 'seat')}.`
                      : 'Add the people you work with, as viewers or editors.'
                }
                action={
                  <Button onClick={onCreate}>
                    {readOnly ? <Lock aria-hidden /> : <UserPlus aria-hidden />} Add member
                  </Button>
                }
              />
            }
          />
        </Card>
      </motion.div>
      <AddMemberModal
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        usage={usage}
        onBlocked={onBlocked}
      />
      <RemoveMemberModal
        open={removing.open}
        onOpenChange={(open) => setRemoving((s) => ({ ...s, open }))}
        member={removing.member}
      />
    </>
  );
}

interface MemberFormValues {
  name: string;
  email: string;
  role: TeamRole;
}

const initialValues: MemberFormValues = { name: '', email: '', role: 'viewer' };

function AddMemberModal({
  open,
  onOpenChange,
  usage,
  onBlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usage: Usage | null;
  onBlocked: (error: AppError) => boolean;
}) {
  const formId = useId();
  const [addMember, { isLoading }] = useAddTeamMemberMutation();

  const submit = async (values: MemberFormValues, helpers: FormikHelpers<MemberFormValues>) => {
    const body: TeamMemberInput = teamMemberSchema.cast(values);
    try {
      await addMember(body).unwrap();
      toast.success(`${body.name} joined your team`);
      onOpenChange(false);
    } catch (e) {
      const err = errorOf(e);
      if (!err) return;
      if (onBlocked(err)) {
        onOpenChange(false);
      } else if (err.code === ERROR_CODES.CONFLICT) {
        // The server's duplicate check has no field detail; it is always about the email.
        helpers.setFieldTouched('email', true, false);
        helpers.setFieldError('email', err.message);
      } else {
        applyServerErrors(err, helpers);
      }
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add a team member"
      description={
        usage?.left != null
          ? `${plural(usage.left, 'seat')} left on your plan.`
          : 'Give them view or edit access to your projects.'
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={isLoading}>
            {!isLoading && <UserPlus aria-hidden />} Add member
          </Button>
        </>
      }
    >
      {/* Lives inside the dialog, so every opening starts from a fresh form. */}
      <Formik initialValues={initialValues} validationSchema={teamMemberSchema} onSubmit={submit}>
        {({ values, status, submitCount }) => (
          <Form id={formId} noValidate className="space-y-4">
            <FocusFirstError />
            {status && (
              <div key={submitCount} className="animate-shake">
                <FormAlert message={status} />
              </div>
            )}
            <TextField
              name="name"
              label="Full name"
              placeholder="Aarav Mehta"
              autoComplete="off"
              maxLength={60}
              autoFocus
            />
            <TextField
              name="email"
              label="Email"
              type="email"
              inputMode="email"
              placeholder="aarav@company.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <SelectField
              name="role"
              label="Role"
              options={TEAM_ROLES.map((role) => ({ value: role, label: ROLES[role].label }))}
              hint={ROLES[values.role].hint}
            />
          </Form>
        )}
      </Formik>
    </Modal>
  );
}

function RemoveMemberModal({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMemberDto | null;
}) {
  const [removeMember, { isLoading }] = useRemoveTeamMemberMutation();

  const confirm = async () => {
    if (!member) return;
    try {
      await removeMember(member.id).unwrap();
      toast.success(`${member.name} was removed from your team`);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorOf(e)?.message ?? "Couldn't remove this team member.");
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Remove this team member?"
      description="They lose access to your projects, and a seat frees up on your plan."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={isLoading} onClick={() => void confirm()}>
            {!isLoading && <UserMinus aria-hidden />} Remove member
          </Button>
        </>
      }
    >
      {member && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3">
          <MemberCell member={member} />
          <RoleBadge role={member.role} />
        </div>
      )}
    </Modal>
  );
}
