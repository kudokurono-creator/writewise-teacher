"use client";
import { useState } from "react";
import { toast } from "sonner";
import {
  classProfileSchema,
  emptyClassProfile,
  type ClassProfile,
  type ClassProfileRecord,
} from "@/types/lesson";
import { request } from "@/lib/utils";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Field } from "./ui/field";
import { FilePicker, type FileRecord } from "./file-picker";
const fields = {
  level: "整体英语水平",
  reading: "阅读基础",
  writing: "写作基础",
  problems: "常见问题",
  strengths: "优势",
  differentiation: "分层情况",
  habits: "学习习惯与课堂特点",
  notes: "教师补充说明",
} as const;
export function ClassProfilePicker({
  initialProfiles,
  documents,
  selectedId,
  onChoose,
}: {
  initialProfiles: ClassProfileRecord[];
  documents: FileRecord[];
  selectedId?: string;
  onChoose: (record?: ClassProfileRecord) => void;
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [profile, setProfile] = useState<ClassProfile>(emptyClassProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = profiles.find((p) => p.id === selectedId);
  function edit(record?: ClassProfileRecord) {
    setEditingId(record?.id);
    setProfile(record?.profile || emptyClassProfile);
    setError("");
    setOpen(true);
  }
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-stack">
      <Field
        label="选择班级学情档案"
        hint="选择后自动载入年级、班级与学情；资料缺少的内容会标为待教师确认。"
      >
        <select
          value={selectedId || ""}
          onChange={(e) =>
            onChoose(profiles.find((p) => p.id === e.target.value))
          }
        >
          <option value="">暂不选择，学情待教师确认</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.profile.className} · {p.profile.grade}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-actions">
        <Button variant="outline" onClick={() => edit()}>
          新建班级档案
        </Button>
        {selected ? (
          <Button variant="ghost" onClick={() => edit(selected)}>
            修改所选班级
          </Button>
        ) : null}
      </div>
      {selected ? (
        <div className="profile-summary">
          <h3>{selected.profile.className}</h3>
          {Object.entries(fields).map(([key, label]) => (
            <p key={key}>
              <b>{label}：</b>
              {selected.profile[key as keyof typeof fields] || "待教师确认"}
            </p>
          ))}
        </div>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        title={editingId ? "修改班级学情档案" : "新建班级学情档案"}
        description="手动填写，或上传/选择学情文件生成草稿，确认后保存。"
        wide
      >
        <div className="form-stack">
          <FilePicker
            initialDocuments={documents}
            selected={profile.documentIds}
            onChange={(documentIds) =>
              setProfile((p) => ({ ...p, documentIds }))
            }
          />
          <Button
            variant="outline"
            disabled={busy || !profile.documentIds.length}
            onClick={() =>
              run(async () => {
                setProfile(
                  await request<ClassProfile>("/api/class-profiles", {
                    action: "analyze",
                    documentIds: profile.documentIds,
                  }),
                );
                toast.success("学情草稿已生成，请核实后保存");
              })
            }
          >
            {busy ? "正在处理…" : "从学情文件生成档案草稿"}
          </Button>
          <div className="form-grid">
            <Field label="班级名称" required>
              <input
                value={profile.className}
                maxLength={150}
                onChange={(e) =>
                  setProfile({ ...profile, className: e.target.value })
                }
                placeholder="高二（3）班"
              />
            </Field>
            <Field label="档案年级">
              <select
                value={profile.grade}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    grade: e.target.value as ClassProfile["grade"],
                  })
                }
              >
                {["高一", "高二", "高三"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="班级人数（可选）">
              <input
                type="number"
                min={1}
                max={200}
                value={profile.size ?? ""}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    size: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </Field>
            {Object.entries(fields).map(([key, label]) => (
              <Field key={key} label={label}>
                <textarea
                  rows={2}
                  maxLength={4000}
                  value={profile[key as keyof typeof fields]}
                  onChange={(e) =>
                    setProfile({ ...profile, [key]: e.target.value })
                  }
                />
              </Field>
            ))}
          </div>
          {error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const parsed = classProfileSchema.parse(profile);
                const record = await request<ClassProfileRecord>(
                  "/api/class-profiles",
                  { id: editingId, profile: parsed },
                );
                setProfiles((prev) => [
                  record,
                  ...prev.filter((p) => p.id !== record.id),
                ]);
                onChoose(record);
                setOpen(false);
                toast.success("班级档案已保存，可在后续备课中复用");
              })
            }
          >
            确认学情并保存档案
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
