import React from 'react';
import { UserPlus } from 'lucide-react';
import { SchemaFieldControl } from '../SchemaFieldControl';
import { Card } from '../PagePrimitives';
import type { CanvasConfigFieldDefinition } from '../../../types/workflowApp';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export interface SetupModelGroup {
  familyId: string;
  familyName: string;
  options: Array<{ value: string; label: string }>;
}

export interface SetupStageCard {
  stageKind: string;
  title: string;
  subtitle: string;
  runtimeLabel?: string | null;
  skillOptions: Array<{ id: string; name: string }>;
  selectedSkillPackId: string;
  modelGroups: SetupModelGroup[];
  selectedModelId: string;
  skillDescription?: string | null;
  promptRecipes: Array<{ id: string; name: string }>;
  selectedPromptRecipeId: string;
  selectedPromptRecipeDescription?: string | null;
  reviewPolicies: Array<{ id: string; name: string; selected: boolean }>;
  configFields: Array<{ fieldKey: string; definition: CanvasConfigFieldDefinition; value: unknown }>;
}

export interface SetupFlowSection {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  stages: SetupStageCard[];
}

interface SetupSecondarySectionsProps {
  flowSections: SetupFlowSection[];
  memberCount: number;
  members: Array<{ id: string; name: string; email: string; roleLabel: string }>;
  memberForm: { email: string; role: 'owner' | 'admin' | 'editor' };
  onSelectSkillPack: (stageKind: string, skillPackId: string) => void;
  onSelectModel: (stageKind: string, modelId: string) => void;
  onSelectPromptRecipe: (stageKind: string, promptRecipeId: string) => void;
  onToggleReviewPolicy: (stageKind: string, policyId: string) => void;
  onChangeModelParam: (stageKind: string, fieldKey: string, nextValue: string | number | boolean) => void;
  onSaveStageConfig: () => void | Promise<void>;
  onMemberFormChange: (patch: Partial<{ email: string; role: 'owner' | 'admin' | 'editor' }>) => void;
  onAddMember: () => void | Promise<void>;
}

export function SetupSecondarySections({
  flowSections,
  memberCount,
  members,
  memberForm,
  onSelectSkillPack,
  onSelectModel,
  onSelectPromptRecipe,
  onToggleReviewPolicy,
  onChangeModelParam,
  onSaveStageConfig,
  onMemberFormChange,
  onAddMember,
}: SetupSecondarySectionsProps) {
  return (
    <section className="space-y-6">
      <Card eyebrow="次级区" title="流程设置">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
          默认沿用当前流程配置。只有在需要调整模型、技能包、提示词方案或审核策略时，再展开这个区域。
        </div>
        <details className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-5">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">高级流程配置</div>
                <div className="mt-2 text-lg font-semibold text-white">模型、技能包与 Prompt 方案</div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60">
                点击展开
              </div>
            </div>
          </summary>
          <div className="mt-5 space-y-5">
            {flowSections.map((flow) => (
              <div key={flow.id} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">{flow.eyebrow}</div>
                  <div className="text-xl font-semibold text-white">{flow.title}</div>
                  <div className="text-sm leading-7 text-slate-300">{flow.description}</div>
                </div>
                <div className="mt-5 space-y-4">
                  {flow.stages.map((stage) => (
                    <div key={stage.stageKind} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="font-semibold text-white">{stage.title}</div>
                          <div className="mt-1 text-sm text-white/55">{stage.subtitle}</div>
                        </div>
                        {stage.runtimeLabel ? (
                          <div className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.08] px-3 py-1 text-xs text-cyan-100">
                            {stage.runtimeLabel}
                          </div>
                        ) : null}
                      </div>

                      <div className={cx('mt-4 grid gap-3', stage.skillOptions.length ? 'md:grid-cols-2' : 'md:grid-cols-1')}>
                        {stage.skillOptions.length ? (
                          <select
                            value={stage.selectedSkillPackId}
                            onChange={(event) => onSelectSkillPack(stage.stageKind, event.target.value)}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                          >
                            <option value="">选择技能包</option>
                            {stage.skillOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </select>
                        ) : null}
                        <select
                          value={stage.selectedModelId}
                          onChange={(event) => onSelectModel(stage.stageKind, event.target.value)}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                        >
                          <option value="">选择模型</option>
                          {stage.modelGroups.map((group) => (
                            <optgroup key={group.familyId} label={group.familyName}>
                              {group.options.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      {stage.skillDescription ? (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-slate-300">
                          {stage.skillDescription}
                        </div>
                      ) : null}

                      {stage.promptRecipes.length ? (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">提示词方案</div>
                          <select
                            value={stage.selectedPromptRecipeId}
                            onChange={(event) => onSelectPromptRecipe(stage.stageKind, event.target.value)}
                            className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                          >
                            {stage.promptRecipes.map((item) => (
                              <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                          </select>
                          {stage.selectedPromptRecipeDescription ? (
                            <div className="mt-3 text-sm leading-7 text-slate-300">{stage.selectedPromptRecipeDescription}</div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {stage.reviewPolicies.map((policy) => (
                          <button
                            key={policy.id}
                            type="button"
                            onClick={() => onToggleReviewPolicy(stage.stageKind, policy.id)}
                            className={cx(
                              'rounded-full px-3 py-1 text-xs',
                              policy.selected ? 'bg-emerald-300 text-black' : 'border border-white/10 bg-white/[0.04] text-slate-200',
                            )}
                          >
                            {policy.name}
                          </button>
                        ))}
                      </div>

                      {stage.configFields.length ? (
                        <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <summary className="cursor-pointer text-sm font-semibold text-white">
                            高级设置
                          </summary>
                          <div className="mt-4 grid gap-3">
                            {stage.configFields.map((field) => (
                              <SchemaFieldControl
                                key={field.fieldKey}
                                fieldKey={field.fieldKey}
                                definition={field.definition}
                                value={field.value}
                                onChange={(nextValue) => onChangeModelParam(stage.stageKind, field.fieldKey, nextValue)}
                              />
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => void onSaveStageConfig()}
              className="mt-5 rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-black"
            >
              保存流程设置
            </button>
          </div>
        </details>
      </Card>

      <Card eyebrow="次级区" title="项目协作">
        <div className="rounded-[24px] border border-amber-300/15 bg-amber-300/[0.08] px-4 py-4 text-sm leading-7 text-amber-50/90">
          {'当前主流程只聚焦“剧本分析 -> 资产生产 -> 剧集 -> 单集工作台”。成员协作先保留在这里，不占主链的主视觉。'}
        </div>
        <details className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-5">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">协作与权限</div>
                <div className="mt-2 text-lg font-semibold text-white">成员管理</div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60">
                {memberCount} 位成员
              </div>
            </div>
          </summary>
          <div className="mt-5 grid gap-3">
            {members.map((member) => (
              <div key={member.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{member.name || member.email}</div>
                    <div className="mt-1 text-xs text-white/45">{member.email}</div>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">{member.roleLabel}</div>
                </div>
              </div>
            ))}
          </div>
          <form
            className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void onAddMember();
            }}
          >
            <input value={memberForm.email} onChange={(event) => onMemberFormChange({ email: event.target.value })} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="成员邮箱" />
            <select value={memberForm.role} onChange={(event) => onMemberFormChange({ role: event.target.value as 'owner' | 'admin' | 'editor' })} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none">
              <option value="editor">编辑</option>
              <option value="admin">管理员</option>
              <option value="owner">所有者</option>
            </select>
            <button className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black">
              <UserPlus size={16} />
              添加成员
            </button>
          </form>
        </details>
      </Card>
    </section>
  );
}
