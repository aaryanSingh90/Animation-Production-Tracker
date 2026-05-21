import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Clock3,
  Flag,
  GripVertical,
  Image,
  LayoutTemplate,
  MoveRight,
  Palette,
  PlusCircle,
  Sparkles,
  X
} from "lucide-react";
import Modal from "./Modal";
import api from "../lib/api";
import { useToastStore } from "../store/toastStore";
import { todayDateInput } from "../utils/format";

const STEPS = [
  { id: 1, title: "Project Details", subtitle: "Core production info" },
  { id: 2, title: "Pipeline Template", subtitle: "Pick a starting workflow" },
  { id: 3, title: "Customize Stages", subtitle: "Fine-tune your pipeline" },
  { id: 4, title: "Review & Create", subtitle: "Final confirmation" }
];

const COLOR_TAGS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#14B8A6"];

const STAGE_EMOJI = {
  audio: "🎧",
  animatics: "🧩",
  modelling: "🧱",
  unwrapping: "🪡",
  charactermodelling: "🧱",
  blendshapes: "✨",
  bgmodelling: "🏞️",
  rigging: "🦴",
  texturing: "🎨",
  animation: "🎬",
  lighting: "💡",
  composite: "🎞️",
  rendering: "🖥️",
  comping: "🎞️",
  compositing: "🎞️",
  editing: "✂️"
};

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function resolveStageCode(stageTemplate) {
  const raw = stageTemplate?.legacyStageName || stageTemplate?.name || "";
  const normalized = String(raw).trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized === "RENDER") return "RENDERING";
  if (normalized === "COMPING") return "COMPOSITING";
  return normalized;
}

function estimateComplexity(count) {
  if (count >= 9) return { label: "High", tone: "bg-rose-100 text-rose-700" };
  if (count >= 6) return { label: "Medium", tone: "bg-amber-100 text-amber-700" };
  return { label: "Lean", tone: "bg-emerald-100 text-emerald-700" };
}

function SortableStageCard({
  stage,
  settings,
  setSettings,
  stageOptions,
  showAdvanced,
  setShowAdvanced,
  index,
  total,
  saving
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const isExpanded = showAdvanced === stage.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border border-slate-200 bg-white/85 p-3 shadow-sm transition ${isDragging ? "opacity-80" : ""}`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="cursor-grab rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-slate-900"
          aria-label={`Reorder ${stage.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm" aria-hidden="true">
            {STAGE_EMOJI[normalizeKey(stage.name)] || "🎯"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{stage.name}</p>
            <p className="text-xs text-slate-500">Stage {index + 1} of {total}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(isExpanded ? null : stage.id)}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          aria-expanded={isExpanded}
          aria-controls={`advanced-${stage.id}`}
        >
          Advanced {isExpanded ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />}
        </button>
      </div>

      {isExpanded && (
        <div id={`advanced-${stage.id}`} className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Stage Deadline</label>
            <input
              type="date"
              value={settings.deadline || ""}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  [stage.id]: {
                    ...prev[stage.id],
                    deadline: event.target.value
                  }
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              disabled={saving}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateProjectWizardModal({
  open,
  onClose,
  onCreate,
  stageTemplates,
  pipelineTemplates,
  clients = [],
  defaultClientId = null,
  saving
}) {
  const showToast = useToastStore((state) => state.showToast);
  const [step, setStep] = useState(1);
  const [details, setDetails] = useState({
    name: "",
    client: "",
    clientId: "",
    description: "",
    priority: 1,
    audioReceivedDate: "",
    totalShots: 0,
    startDate: todayDateInput(),
    dueDate: "",
    lightingMode: "SHOT",
    renderingMode: "PROJECT",
    colorTag: COLOR_TAGS[0],
    thumbnailUrl: ""
  });
  const [availableClients, setAvailableClients] = useState(clients || []);
  const [showInlineClientCreate, setShowInlineClientCreate] = useState(false);
  const [inlineClientName, setInlineClientName] = useState("");
  const [inlineClientCompany, setInlineClientCompany] = useState("");
  const [creatingInlineClient, setCreatingInlineClient] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [selectedStageIds, setSelectedStageIds] = useState([]);
  const [stageSettings, setStageSettings] = useState({});
  const [expandedAdvancedId, setExpandedAdvancedId] = useState(null);
  const [showCustomTemplateBanner, setShowCustomTemplateBanner] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const templatesById = useMemo(() => new Map(stageTemplates.map((item) => [item.id, item])), [stageTemplates]);

  const selectedStages = useMemo(
    () => selectedStageIds.map((id) => templatesById.get(id)).filter(Boolean),
    [selectedStageIds, templatesById]
  );

  const complexity = useMemo(() => estimateComplexity(selectedStages.length), [selectedStages.length]);

  useEffect(() => {
    if (!open) return;

    const incomingClients = Array.isArray(clients) ? clients : [];
    const selectedDefaultClient = incomingClients.find((client) => Number(client.id) === Number(defaultClientId)) || null;

    const fullTemplate = pipelineTemplates.find((template) => template.id === "template_full") || pipelineTemplates[0];

    const defaultStageIds = (fullTemplate?.stages || [])
      .map((stageName) => {
        const lookup = normalizeKey(stageName);
        const match = stageTemplates.find((item) => {
          const byLegacy = normalizeKey(item.legacyStageName);
          const byName = normalizeKey(item.name);
          return byLegacy === lookup || byName === lookup;
        });
        return match?.id;
      })
      .filter(Boolean);

    setStep(1);
    setDetails({
      name: "",
      client: selectedDefaultClient?.name || "",
      clientId: selectedDefaultClient?.id ? String(selectedDefaultClient.id) : "",
      description: "",
      priority: 1,
      audioReceivedDate: "",
      totalShots: 0,
      startDate: todayDateInput(),
      dueDate: "",
      lightingMode: "SHOT",
      renderingMode: "PROJECT",
      colorTag: COLOR_TAGS[0],
      thumbnailUrl: ""
    });
    setAvailableClients(incomingClients);
    setShowInlineClientCreate(false);
    setInlineClientName("");
    setInlineClientCompany("");
    setSelectedPipelineId(fullTemplate?.id || "custom");
    setSelectedStageIds(defaultStageIds.length ? defaultStageIds : stageTemplates.map((stage) => stage.id));
    setStageSettings({});
    setExpandedAdvancedId(null);
    setShowCustomTemplateBanner(false);
  }, [open, pipelineTemplates, stageTemplates, clients, defaultClientId]);

  function applyTemplate(templateId) {
    const template = pipelineTemplates.find((item) => item.id === templateId);
    setSelectedPipelineId(templateId);
    setShowCustomTemplateBanner(false);

    if (!template) return;

    const ids = template.stages
      .map((stageName) => {
        const key = normalizeKey(stageName);
        const match = stageTemplates.find((item) => {
          const byLegacy = normalizeKey(item.legacyStageName);
          const byName = normalizeKey(item.name);
          return byLegacy === key || byName === key;
        });
        return match?.id;
      })
      .filter(Boolean);

    if (ids.length) {
      setSelectedStageIds(ids);
    }
  }

  function toggleStage(stageId) {
    setSelectedPipelineId("custom");
    setShowCustomTemplateBanner(true);
    setSelectedStageIds((current) => {
      if (current.includes(stageId)) return current.filter((id) => id !== stageId);
      return [...current, stageId];
    });
  }

  function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSelectedPipelineId("custom");
    setShowCustomTemplateBanner(true);
    setSelectedStageIds((items) => {
      const oldIndex = items.indexOf(active.id);
      const newIndex = items.indexOf(over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  const canContinueStep1 = Boolean(details.name.trim());
  const canContinueStep2 = selectedStageIds.length > 0;
  const canContinueStep3 = selectedStages.length > 0;

  async function createInlineClient() {
    const name = inlineClientName.trim();
    if (!name) {
      showToast("error", "Client name is required");
      return;
    }

    setCreatingInlineClient(true);
    try {
      const { data } = await api.post("/clients", {
        name,
        companyName: inlineClientCompany.trim()
      });
      const nextClients = [...availableClients, data].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      setAvailableClients(nextClients);
      setDetails((prev) => ({
        ...prev,
        client: data.name,
        clientId: String(data.id)
      }));
      setShowInlineClientCreate(false);
      setInlineClientName("");
      setInlineClientCompany("");
      showToast("success", "Client created");
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to create client");
    } finally {
      setCreatingInlineClient(false);
    }
  }

  async function handleCreate() {
    const activeStageCodes = Array.from(new Set(selectedStages.map((stage) => resolveStageCode(stage)).filter(Boolean)));
    const selectedClient = availableClients.find((client) => String(client.id) === String(details.clientId));
    const parsedClientId = details.clientId ? Number(details.clientId) : null;

    const payload = {
      name: details.name.trim(),
      client: selectedClient?.name || details.client?.trim() || "",
      clientId: Number.isFinite(parsedClientId) && parsedClientId > 0 ? parsedClientId : null,
      description: details.description,
      priority: Number(details.priority),
      totalShots: Number(details.totalShots) || 0,
      lightingMode: details.lightingMode === "SHOT" ? "SHOT" : "PROJECT",
      renderingMode: details.renderingMode === "SHOT" ? "SHOT" : "PROJECT",
      activeStageCodes,
      stages: selectedStages.map((stage, index) => {
        const settings = stageSettings[stage.id] || {};
        const stagePayload = {
          stageTemplateId: stage.id,
          stageName: stage.legacyStageName || resolveStageCode(stage) || "CUSTOM",
          order: index + 1,
          isActive: true
        };

        if (settings.deadline) {
          stagePayload.deadline = settings.deadline;
        }

        if (!stage.legacyStageName) {
          stagePayload.customName = stage.name;
        }

        return stagePayload;
      })
    };

    if (details.audioReceivedDate) {
      payload.audioReceivedDate = details.audioReceivedDate;
    }
    if (details.startDate) {
      payload.startDate = details.startDate;
    }
    if (details.dueDate) {
      payload.dueDate = details.dueDate;
    }

    await onCreate(payload);
  }

  return (
    <Modal open={open} onClose={onClose} title="Create New Project" size="max-w-[1100px]">
      <div className="-mx-2 -mb-2 flex h-[min(86vh,760px)] min-h-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur">
          <div className="md:hidden">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {step} of {STEPS.length}</p>
            <p className="text-sm font-semibold text-slate-900">{STEPS[step - 1].title}</p>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {STEPS.map((item, index) => {
              const active = step === item.id;
              const complete = step > item.id;
              return (
                <div key={item.id} className="flex min-w-0 flex-1 items-center gap-2">
                  <div className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${complete ? "bg-emerald-500 text-white" : active ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"}`}>
                    {complete ? <Check size={14} /> : item.id}
                  </div>
                  <div className="min-w-0">
                    <p className={`truncate text-xs font-semibold ${active ? "text-slate-900" : "text-slate-600"}`}>{item.title}</p>
                    <p className="truncate text-[11px] text-slate-500">{item.subtitle}</p>
                  </div>
                  {index < STEPS.length - 1 && <MoveRight size={14} className="text-slate-400" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
            <div className="mx-auto max-w-3xl">
              {step === 1 && (
                <div className="space-y-4">
                  <header>
                    <h4 className="text-xl font-bold text-slate-900">Project Details</h4>
                    <p className="text-sm text-slate-500">Set the core info before designing your production pipeline.</p>
                  </header>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Project Name</label>
                      <input
                        value={details.name}
                        onChange={(event) => setDetails((prev) => ({ ...prev, name: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
                        placeholder="Lakdi Ki Kathi - Season 1"
                        aria-label="Project Name"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Description</label>
                      <textarea
                        rows={3}
                        value={details.description}
                        onChange={(event) => setDetails((prev) => ({ ...prev, description: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
                        placeholder="Brief creative direction, episode goals, delivery requirements..."
                        aria-label="Project Description"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Client</label>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={details.clientId}
                          onChange={(event) => {
                            const selectedId = event.target.value;
                            const selectedClient = availableClients.find((client) => String(client.id) === selectedId);
                            setDetails((prev) => ({
                              ...prev,
                              clientId: selectedId,
                              client: selectedClient?.name || ""
                            }));
                          }}
                          className="min-w-[220px] flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
                          aria-label="Client Dropdown"
                        >
                          <option value="">No client selected</option>
                          {availableClients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}{client.companyName ? ` · ${client.companyName}` : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setShowInlineClientCreate((prev) => !prev)}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          + New Client
                        </button>
                      </div>

                      {showInlineClientCreate && (
                        <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto]">
                          <input
                            value={inlineClientName}
                            onChange={(event) => setInlineClientName(event.target.value)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            placeholder="Client name"
                            aria-label="New Client Name"
                          />
                          <input
                            value={inlineClientCompany}
                            onChange={(event) => setInlineClientCompany(event.target.value)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            placeholder="Company (optional)"
                            aria-label="New Client Company"
                          />
                          <button
                            type="button"
                            onClick={createInlineClient}
                            disabled={creatingInlineClient}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {creatingInlineClient ? "Creating..." : "Create"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Total Shots</label>
                      <input
                        type="number"
                        min="0"
                        max="5000"
                        value={details.totalShots}
                        onChange={(event) => setDetails((prev) => ({ ...prev, totalShots: Math.max(0, Number(event.target.value) || 0) }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
                        aria-label="Total Shots"
                      />
                    </div>

                    <div>
                      <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600"><Flag size={13} /> Priority</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={details.priority}
                        onChange={(event) => setDetails((prev) => ({ ...prev, priority: Number(event.target.value) || 1 }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
                        aria-label="Project Priority"
                      />
                    </div>

                    <div>
                      <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600"><CalendarDays size={13} /> Audio Received Date</label>
                      <input
                        type="date"
                        value={details.audioReceivedDate}
                        onChange={(event) => setDetails((prev) => ({ ...prev, audioReceivedDate: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
                        aria-label="Audio Received Date"
                      />
                    </div>

                    <div>
                      <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600"><CalendarDays size={13} /> Start Date</label>
                      <input
                        type="date"
                        value={details.startDate}
                        onChange={(event) => setDetails((prev) => ({ ...prev, startDate: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
                        aria-label="Start Date"
                      />
                    </div>

                    <div>
                      <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600"><Clock3 size={13} /> Due Date</label>
                      <input
                        type="date"
                        value={details.dueDate}
                        onChange={(event) => setDetails((prev) => ({ ...prev, dueDate: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
                        aria-label="Due Date"
                      />
                    </div>

                    <div>
                      <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600"><Image size={13} /> Thumbnail URL (Optional)</label>
                      <input
                        type="url"
                        value={details.thumbnailUrl}
                        onChange={(event) => setDetails((prev) => ({ ...prev, thumbnailUrl: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
                        placeholder="https://..."
                        aria-label="Thumbnail URL"
                      />
                    </div>

                    <div>
                      <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600"><Palette size={13} /> Color Tag</label>
                      <div className="flex items-center gap-2">
                        {COLOR_TAGS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setDetails((prev) => ({ ...prev, colorTag: color }))}
                            className={`h-7 w-7 rounded-full border-2 transition ${details.colorTag === color ? "border-slate-900 scale-110" : "border-white/80"}`}
                            style={{ backgroundColor: color }}
                            aria-label={`Choose color ${color}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <header>
                    <h4 className="text-xl font-bold text-slate-900">Choose Pipeline Template</h4>
                    <p className="text-sm text-slate-500">Start from a proven production pipeline, then customize it.</p>
                  </header>

                  <div className="grid gap-3 md:grid-cols-2">
                    {pipelineTemplates.map((template) => {
                      const stageCount = template.stages.length;
                      const templateComplexity = estimateComplexity(stageCount);
                      const selected = selectedPipelineId === template.id;

                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => applyTemplate(template.id)}
                          className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}
                          aria-pressed={selected}
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div>
                              <p className="text-base font-bold">{template.name}</p>
                              <p className={`text-xs ${selected ? "text-slate-200" : "text-slate-500"}`}>{stageCount} stages</p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${selected ? "bg-white/15 text-white" : templateComplexity.tone}`}>
                              {templateComplexity.label}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {template.stages.slice(0, 5).map((stageName) => (
                              <span key={stageName} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"}`}>
                                {String(stageName).replaceAll("_", " ")}
                              </span>
                            ))}
                            {template.stages.length > 5 && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"}`}>
                                +{template.stages.length - 5} more
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPipelineId("custom");
                        setShowCustomTemplateBanner(true);
                      }}
                      className={`rounded-2xl border border-dashed p-4 text-left transition ${selectedPipelineId === "custom" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:border-slate-500"}`}
                    >
                      <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                        <PlusCircle size={16} /> Create Custom Pipeline
                      </div>
                      <p className={`text-xs ${selectedPipelineId === "custom" ? "text-slate-200" : "text-slate-500"}`}>
                        Start with your own stage combination and order.
                      </p>
                    </button>
                  </div>

                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <header>
                    <h4 className="text-xl font-bold text-slate-900">Customize Stages</h4>
                    <p className="text-sm text-slate-500">Toggle stages and drag to reorder your active pipeline.</p>
                  </header>

                  {showCustomTemplateBanner && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
                      Custom mode enabled. Your stage selection overrides template defaults.
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Stage Selector</p>
                    <div className="flex flex-wrap gap-2">
                      {stageTemplates.map((stage) => {
                        const selected = selectedStageIds.includes(stage.id);
                        return (
                          <button
                            key={stage.id}
                            type="button"
                            onClick={() => toggleStage(stage.id)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"}`}
                            aria-pressed={selected}
                          >
                            <span>{selected ? "✓" : "○"}</span>
                            <span>{stage.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Active Pipeline Preview</p>
                    {!selectedStages.length ? (
                      <p className="text-sm text-slate-500">Select stages to build your pipeline.</p>
                    ) : (
                      <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        {selectedStages.map((stage, index) => (
                          <div key={stage.id} className="flex items-center gap-2 whitespace-nowrap">
                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">{stage.name}</span>
                            {index < selectedStages.length - 1 && <MoveRight size={14} className="text-slate-400" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Drag To Reorder Stages</p>

                    {!selectedStages.length ? (
                      <p className="text-sm text-slate-500">Choose at least one stage.</p>
                    ) : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                        <SortableContext items={selectedStageIds} strategy={verticalListSortingStrategy}>
                          <div className="space-y-2">
                            {selectedStages.map((stage, index) => (
                              <SortableStageCard
                                key={stage.id}
                                stage={stage}
                                index={index}
                                total={selectedStages.length}
                                settings={stageSettings[stage.id] || {}}
                                setSettings={setStageSettings}
                                stageOptions={selectedStages}
                                showAdvanced={expandedAdvancedId}
                                setShowAdvanced={setExpandedAdvancedId}
                                saving={saving}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <header>
                    <h4 className="text-xl font-bold text-slate-900">Review & Create</h4>
                    <p className="text-sm text-slate-500">Confirm your project and pipeline settings before creating.</p>
                  </header>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-3">
                      <span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: details.colorTag }} />
                      <div>
                        <p className="text-base font-bold text-slate-900">{details.name || "Untitled Project"}</p>
                        <p className="text-xs text-slate-500">Priority {details.priority} · {selectedStages.length} stages</p>
                      </div>
                    </div>
                    <p className="mb-3 text-sm text-slate-600">{details.description || "No description provided."}</p>

                    <div className="grid gap-3 text-xs text-slate-600 md:grid-cols-3">
                      <p><span className="font-semibold text-slate-700">Client:</span> {details.client || "-"}</p>
                      <p><span className="font-semibold text-slate-700">Audio Received:</span> {details.audioReceivedDate || "-"}</p>
                      <p><span className="font-semibold text-slate-700">Start Date:</span> {details.startDate || "-"}</p>
                      <p><span className="font-semibold text-slate-700">Due Date:</span> {details.dueDate || "-"}</p>
                      <p><span className="font-semibold text-slate-700">Total Shots:</span> {details.totalShots}</p>
                      <p><span className="font-semibold text-slate-700">Thumbnail:</span> {details.thumbnailUrl ? "Provided" : "Not set"}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Final Pipeline</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedStages.map((stage, index) => (
                        <div key={stage.id} className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{stage.name}</span>
                          {index < selectedStages.length - 1 && <MoveRight size={14} className="text-slate-400" />}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>

          <aside className="hidden w-[290px] border-l border-slate-200 bg-white/80 p-4 lg:block">
            <div className="sticky top-2 space-y-3">
              <div className="flex items-center gap-2">
                <LayoutTemplate size={16} className="text-slate-700" />
                <h5 className="text-sm font-bold text-slate-900">Pipeline Summary</h5>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SummaryStat label="Stages" value={selectedStages.length} icon={<Sparkles size={14} />} />
                <SummaryStat label="Shots" value={Number(details.totalShots) || 0} icon={<Clapperboard size={14} />} />
                <SummaryStat label="Audio" value={selectedStages.some((stage) => resolveStageCode(stage) === "AUDIO") ? "On" : "Off"} icon={<Palette size={14} />} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Complexity</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${complexity.tone}`}>{complexity.label}</span>
                </div>
                <div className="space-y-1">
                  {selectedStages.map((stage, index) => (
                    <div key={stage.id} className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white font-semibold">{index + 1}</span>
                      <span className="truncate">{stage.name}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </aside>
        </div>

        <footer className="sticky bottom-0 z-20 flex items-center justify-between border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => {
              if (step === 1) {
                onClose();
                return;
              }
              setStep((prev) => Math.max(1, prev - 1));
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            disabled={saving}
          >
            <ArrowLeft size={14} /> {step === 1 ? "Cancel" : "Back"}
          </button>

          <div className="flex items-center gap-2">
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((prev) => Math.min(4, prev + 1))}
                disabled={(step === 1 && !canContinueStep1) || (step === 2 && !canContinueStep2) || (step === 3 && !canContinueStep3) || saving}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Continue <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving || !canContinueStep1 || !canContinueStep3}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Project"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </Modal>
  );
}

function SummaryStat({ label, value, icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2">
      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </p>
      <p className="text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
