import { PROJECT_COLORS, projectSchema } from '@planpilot/shared';
import type { ProjectDto, ProjectInput } from '@planpilot/shared';
import { Form, Formik, useField } from 'formik';
import type { FormikHelpers } from 'formik';
import {
  Check,
  FolderKanban,
  FolderPlus,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { Variants } from 'motion/react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { errorOf } from '../../api/errors';
import type { AppError } from '../../api/errors';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Modal } from '../../components/ui/dialog';
import { EmptyState, Skeleton } from '../../components/ui/feedback';
import {
  applyServerErrors,
  FocusFirstError,
  FormAlert,
  TextareaField,
  TextField,
} from '../../components/ui/form';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/ui/menu';
import { cn } from '../../lib/cn';
import { formatDate, plural } from '../../lib/format';
import type { Usage } from './limits';
import { LoadError } from './LoadError';
import { colorOf, isProjectColor, PROJECT_COLOR } from './projectColors';
import type { ProjectColor } from './projectColors';
import {
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useProjectsQuery,
  useUpdateProjectMutation,
} from './workspaceApi';

const listVariants: Variants = { show: { transition: { staggerChildren: 0.05 } } };
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

interface Target {
  open: boolean;
  project: ProjectDto | null;
}
const closed: Target = { open: false, project: null };

export function ProjectsPanel({
  usage,
  readOnly,
  createOpen,
  onCreateOpenChange,
  onCreate,
  onReadOnly,
  onBlocked,
}: {
  usage: Usage | null;
  readOnly: boolean;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  /** Starts a new project, checking the plan first. */
  onCreate: () => void;
  onReadOnly: () => void;
  /** True when the error was a plan limit or read-only answer and is now shown. */
  onBlocked: (error: AppError) => boolean;
}) {
  const { data: projects, isError, error, refetch, isFetching } = useProjectsQuery();
  // The target outlives `open` so a closing dialog keeps its content while it animates out.
  const [editing, setEditing] = useState<Target>(closed);
  const [deleting, setDeleting] = useState<Target>(closed);

  const edit = (project: ProjectDto) =>
    readOnly ? onReadOnly() : setEditing({ open: true, project });

  let body;
  if (!projects) {
    body = isError ? (
      <LoadError
        title="We couldn't load your projects"
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    ) : (
      <ProjectsSkeleton />
    );
  } else if (!projects.length) {
    body = (
      <Card>
        <EmptyState
          illustration="emptyBoard"
          title="No projects yet"
          description={
            readOnly
              ? 'Projects come with a plan. Pick one to start organising your work.'
              : usage?.limit != null
                ? `Create your first project to get organised. Your plan has room for ${plural(usage.limit, 'project')}.`
                : 'Create your first project to get organised.'
          }
          action={
            <Button onClick={onCreate}>
              {readOnly ? <Lock aria-hidden /> : <FolderPlus aria-hidden />} New project
            </Button>
          }
        />
      </Card>
    );
  } else {
    body = (
      <motion.ul
        className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        variants={listVariants}
        initial="hidden"
        animate="show"
      >
        <AnimatePresence mode="popLayout">
          {projects.map((project) => (
            <motion.li
              key={project.id}
              layout
              variants={itemVariants}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="min-w-0"
            >
              <ProjectCard
                project={project}
                readOnly={readOnly}
                onEdit={edit}
                onDelete={(p) => setDeleting({ open: true, project: p })}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    );
  }

  return (
    <>
      <h2 className="sr-only">Projects</h2>
      {body}
      <ProjectFormModal
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        project={null}
        onBlocked={onBlocked}
      />
      <ProjectFormModal
        open={editing.open}
        onOpenChange={(open) => setEditing((s) => ({ ...s, open }))}
        project={editing.project}
        onBlocked={onBlocked}
      />
      <DeleteProjectModal
        open={deleting.open}
        onOpenChange={(open) => setDeleting((s) => ({ ...s, open }))}
        project={deleting.project}
      />
    </>
  );
}

function ColorTile({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-card',
        colorOf(color).tile,
        className,
      )}
      aria-hidden
    >
      <FolderKanban className="size-5" />
    </span>
  );
}

function ProjectCard({
  project,
  readOnly,
  onEdit,
  onDelete,
}: {
  project: ProjectDto;
  readOnly: boolean;
  onEdit: (project: ProjectDto) => void;
  onDelete: (project: ProjectDto) => void;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden p-0 transition-shadow duration-200 hover:shadow-pop">
      <span className={cn('h-1.5 shrink-0', colorOf(project.color).solid)} aria-hidden />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <ColorTile color={project.color} />
          <h3 className="min-w-0 flex-1 truncate leading-snug font-extrabold" title={project.name}>
            {project.name}
          </h3>
          {/* Non-modal so the dialogs it opens get focus and pointer events back cleanly. */}
          <Menu modal={false}>
            <MenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 shrink-0 text-muted hover:text-ink"
                aria-label={`Actions for ${project.name}`}
              >
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent className="min-w-48">
              <MenuItem className="min-h-11" onSelect={() => onEdit(project)}>
                {readOnly ? <Lock /> : <Pencil />} Edit project
              </MenuItem>
              <MenuSeparator />
              <MenuItem className="min-h-11" danger onSelect={() => onDelete(project)}>
                <Trash2 /> Delete project
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
        <p
          className={cn(
            'mt-3 line-clamp-2 min-h-10 text-sm break-words',
            project.description ? 'text-muted' : 'text-subtle italic',
          )}
        >
          {project.description || 'No description yet.'}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs">
          <span className="text-subtle">
            Created{' '}
            <time dateTime={project.createdAt} className="font-bold text-muted">
              {formatDate(project.createdAt)}
            </time>
          </span>
          {readOnly && (
            <Badge tone="warning">
              <Lock className="size-3" aria-hidden /> Read-only
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}

function ProjectsSkeleton() {
  return (
    <ul
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy
      aria-label="Loading projects"
    >
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Card className="overflow-hidden p-0">
            <Skeleton className="h-1.5 rounded-none" />
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-xl" />
                <Skeleton className="h-4 flex-1" />
              </div>
              <Skeleton className="mt-4 h-3.5 w-full" />
              <Skeleton className="mt-2 h-3.5 w-2/3" />
              <Skeleton className="mt-6 h-3 w-28" />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

interface ProjectFormValues {
  name: string;
  description: string;
  color: ProjectColor;
}

function ProjectFormModal({
  open,
  onOpenChange,
  project,
  onBlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDto | null;
  onBlocked: (error: AppError) => boolean;
}) {
  const formId = useId();
  const [createProject, createState] = useCreateProjectMutation();
  const [updateProject, updateState] = useUpdateProjectMutation();
  const saving = createState.isLoading || updateState.isLoading;

  const initialValues: ProjectFormValues = {
    name: project?.name ?? '',
    description: project?.description ?? '',
    color: project && isProjectColor(project.color) ? project.color : 'indigo',
  };

  const submit = async (values: ProjectFormValues, helpers: FormikHelpers<ProjectFormValues>) => {
    // Cast runs the shared sanitising transforms, so we send what the server will store.
    const body: ProjectInput = projectSchema.cast(values);
    try {
      if (project) {
        await updateProject({ id: project.id, body }).unwrap();
        toast.success('Project updated');
      } else {
        await createProject(body).unwrap();
        toast.success(`${body.name} is ready`);
      }
      onOpenChange(false);
    } catch (e) {
      const err = errorOf(e);
      if (!err) return;
      if (onBlocked(err)) onOpenChange(false);
      else applyServerErrors(err, helpers);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={project ? 'Edit project' : 'New project'}
      description={
        project
          ? 'Update the name, description or colour.'
          : "Give it a name and a colour so it's easy to spot."
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {project ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      {/* Lives inside the dialog, so every opening starts from a fresh form. */}
      <Formik initialValues={initialValues} validationSchema={projectSchema} onSubmit={submit}>
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
              label="Project name"
              placeholder="Website redesign"
              autoComplete="off"
              maxLength={60}
              autoFocus
            />
            <TextareaField
              name="description"
              label="Description"
              placeholder="What is this project about?"
              rows={3}
              maxLength={200}
              hint={`Optional · ${values.description.length}/200`}
            />
            <ColorPicker />
          </Form>
        )}
      </Formik>
    </Modal>
  );
}

/** Native radios, so arrow keys move between swatches and screen readers hear each name. */
function ColorPicker() {
  const [field, meta] = useField<string>('color');
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-extrabold text-muted">
        Colour · <span className="text-ink">{colorOf(field.value).label}</span>
      </legend>
      <div className="-ml-1.5 flex flex-wrap gap-0.5">
        {PROJECT_COLORS.map((color) => (
          <label
            key={color}
            className="group grid size-11 cursor-pointer place-items-center"
            title={PROJECT_COLOR[color].label}
          >
            <input
              type="radio"
              name={field.name}
              value={color}
              checked={field.value === color}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className="peer sr-only"
            />
            <span
              className={cn(
                'grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-transform duration-150 group-hover:scale-110',
                'peer-checked:ring-2 peer-checked:ring-ink peer-checked:[&>svg]:opacity-100',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-brand',
                PROJECT_COLOR[color].solid,
              )}
            >
              <Check
                className="size-4 text-white opacity-0 transition-opacity"
                strokeWidth={3}
                aria-hidden
              />
            </span>
            <span className="sr-only">{PROJECT_COLOR[color].label}</span>
          </label>
        ))}
      </div>
      {meta.touched && meta.error && (
        <p className="mt-1.5 text-[13px] font-bold text-danger-ink">{meta.error}</p>
      )}
    </fieldset>
  );
}

function DeleteProjectModal({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDto | null;
}) {
  const [deleteProject, { isLoading }] = useDeleteProjectMutation();

  const confirm = async () => {
    if (!project) return;
    try {
      await deleteProject(project.id).unwrap();
      toast.success(`${project.name} deleted`);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorOf(e)?.message ?? "Couldn't delete the project.");
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Delete this project?"
      description="This can't be undone. It also frees up a project slot on your plan."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={isLoading} onClick={() => void confirm()}>
            {!isLoading && <Trash2 aria-hidden />} Delete project
          </Button>
        </>
      }
    >
      {project && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
          <ColorTile color={project.color} className="size-10" />
          <div className="min-w-0">
            <p className="truncate font-extrabold">{project.name}</p>
            <p className="truncate text-[13px] text-muted">
              {project.description || `Created ${formatDate(project.createdAt)}`}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
