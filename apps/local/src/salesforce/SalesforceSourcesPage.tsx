import { Link } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { useMemo, useState } from "react";
import {
  logoForSourceId,
  productGroupForSourceId,
  productGroupOrder,
  salesforceProductLogos,
  salesforceSourceRegistry,
  type SalesforceProductGroup,
  type SalesforceSourceDefinition,
} from "@salesforce-executor/docs-index";
import { sourcesOptimisticAtom, toolsAtom } from "@executor-js/react/api/atoms";
import { Badge } from "@executor-js/react/components/badge";
import { Button } from "@executor-js/react/components/button";
import {
  CardStack,
  CardStackContent,
  CardStackEntry,
  CardStackEntryActions,
  CardStackEntryContent,
  CardStackEntryDescription,
  CardStackEntryMedia,
  CardStackEntryTitle,
} from "@executor-js/react/components/card-stack";
import { useScope } from "@executor-js/react/api/scope-context";
import { OfficialProductLogo } from "./OfficialProductLogo";

// Group routing is driven by the `sourceProductGroups` table in
// `@salesforce-executor/docs-index`. Falling back to vendor-name matching
// avoids dropping a freshly-added source on the floor when someone forgets
// to extend the table — the registry test still flags the missing entry.
const groupFor = (source: SalesforceSourceDefinition): SalesforceProductGroup | undefined => {
  const explicit = productGroupForSourceId(source.id);
  if (explicit) return explicit;
  return productGroupOrder.find((group) => group === source.vendor);
};

const pluginKeyFor = (source: SalesforceSourceDefinition): "mcp" | "openapi" | "graphql" | null => {
  if (source.kind === "openapi") return "openapi";
  if (source.kind === "graphql") return "graphql";
  if (
    source.kind === "mcp-remote" ||
    source.kind === "mcp-stdio" ||
    source.kind === "cli-bridge" ||
    source.kind === "local-adapter"
  ) {
    return "mcp";
  }
  return null;
};

function sourceNamespace(source: SalesforceSourceDefinition): string | undefined {
  const config = source.executorSourceConfig;
  if (!config) return undefined;
  return "namespace" in config ? config.namespace : undefined;
}

function CopyButton(props: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(props.value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? "Copied" : props.label}
    </Button>
  );
}

function SourceCard(props: {
  source: SalesforceSourceDefinition;
  connected: boolean;
  toolCount?: number;
}) {
  const pluginKey = pluginKeyFor(props.source);
  const namespace = sourceNamespace(props.source);
  const logo = logoForSourceId(props.source.id);
  const media = logo ? (
    <CardStackEntryMedia
      className={
        logo.presentation === "official-logo"
          ? "h-12 w-24 bg-transparent"
          : "size-12 bg-transparent"
      }
    >
      <OfficialProductLogo logo={logo} size="lg" />
    </CardStackEntryMedia>
  ) : null;
  const content = (
    <>
      {media}
      <CardStackEntryContent>
        <CardStackEntryTitle className="flex flex-wrap items-center gap-2">
          <span>{props.source.product}</span>
          {props.connected && (props.toolCount ?? 0) > 0 && (
            <Badge variant="secondary">tool-live · {props.toolCount ?? 0}</Badge>
          )}
          {props.connected && (props.toolCount ?? 0) === 0 && (
            <Badge variant="outline">registered</Badge>
          )}
        </CardStackEntryTitle>
        <CardStackEntryDescription>
          {props.source.vendor} · {props.source.kind} · {props.source.authProfile}
        </CardStackEntryDescription>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant={props.source.officialStatus === "official" ? "default" : "outline"}>
            {props.source.officialStatus}
          </Badge>
        </div>
      </CardStackEntryContent>
    </>
  );
  const primaryClassName =
    "flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <CardStackEntry
      className="hover:bg-accent/40"
      searchText={`${props.source.vendor} ${props.source.product} ${props.source.kind} ${props.source.officialStatus} ${props.source.skills.join(" ")}`}
    >
      {props.connected && namespace ? (
        <Link
          to="/sources/$namespace"
          params={{ namespace }}
          className={primaryClassName}
          aria-label={`Open ${props.source.product}`}
        >
          {content}
        </Link>
      ) : pluginKey ? (
        <Link
          to="/sources/add/$pluginKey"
          params={{ pluginKey }}
          className={primaryClassName}
          aria-label={`Add ${props.source.product}`}
        >
          {content}
        </Link>
      ) : (
        <a
          href={props.source.docsUrl}
          target="_blank"
          rel="noreferrer"
          className={primaryClassName}
          aria-label={`Open ${props.source.product} docs`}
        >
          {content}
        </a>
      )}
      <CardStackEntryActions>
        {namespace && props.connected && (
          <Link
            to="/sources/$namespace"
            params={{ namespace }}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Open
          </Link>
        )}
        <a
          href={props.source.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          Docs
        </a>
        {pluginKey && !props.connected && (
          <Link
            to="/sources/add/$pluginKey"
            params={{ pluginKey }}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Add
          </Link>
        )}
      </CardStackEntryActions>
    </CardStackEntry>
  );
}

export function SalesforceSourcesPage() {
  const scopeId = useScope();
  const sources = useAtomValue(sourcesOptimisticAtom(scopeId));
  const tools = useAtomValue(toolsAtom(scopeId));
  const groups = useMemo(
    () =>
      productGroupOrder
        .map((product) => ({
          product,
          sources: salesforceSourceRegistry.filter((source) => groupFor(source) === product),
        }))
        .filter((group) => group.sources.length > 0),
    [],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10 lg:py-14">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <OfficialProductLogo
              logo={salesforceProductLogos.salesforce}
              size="lg"
              className="mt-0.5"
            />
            <div className="min-w-0">
              <h1 className="font-display text-3xl tracking-tight text-foreground lg:text-4xl">
                Salesforce Executor
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Curated Salesforce-family sources for MCP, OpenAPI, GraphQL, CLI bridges, docs, and
                local skills.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/source-manager"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              Manage sources
            </Link>
            <CopyButton value="bun run doctor:salesforce" label="Copy doctor command" />
          </div>
        </div>

        {AsyncResult.match(sources, {
          onInitial: () => (
            <p className="text-sm text-muted-foreground">Loading Salesforce source status...</p>
          ),
          onFailure: () => (
            <p className="text-sm text-destructive">Failed to load source status.</p>
          ),
          onSuccess: ({ value }) => {
            const sourceStatus = new Map(value.map((source) => [source.id, source]));
            const toolValue = AsyncResult.isSuccess(tools) ? tools.value : [];
            const toolsBySource = new Map<string, number>();
            for (const tool of toolValue) {
              toolsBySource.set(tool.sourceId, (toolsBySource.get(tool.sourceId) ?? 0) + 1);
            }
            const registeredCount = salesforceSourceRegistry.filter((source) => {
              const namespace = sourceNamespace(source);
              return namespace ? sourceStatus.has(namespace) : false;
            }).length;
            const liveSourceCount = Array.from(toolsBySource.values()).filter(
              (count) => count > 0,
            ).length;
            const toolCount = toolValue.length;
            return (
              <>
                <p className="mb-8 text-xs text-muted-foreground">
                  {salesforceSourceRegistry.length} catalog entries · {registeredCount} registered ·{" "}
                  {liveSourceCount} live sources · {toolCount} live tools
                </p>

                <div className="space-y-7">
                  {groups.map((group) => (
                    <section key={group.product}>
                      <div className="mb-2 flex items-center justify-between">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                          {group.product}
                        </h2>
                      </div>
                      <CardStack searchable>
                        <CardStackContent>
                          {group.sources.map((source) => {
                            const namespace = sourceNamespace(source);
                            const connected = namespace ? sourceStatus.get(namespace) : undefined;
                            return (
                              <SourceCard
                                key={source.id}
                                source={source}
                                connected={Boolean(connected)}
                                toolCount={namespace ? toolsBySource.get(namespace) : undefined}
                              />
                            );
                          })}
                        </CardStackContent>
                      </CardStack>
                    </section>
                  ))}
                </div>
              </>
            );
          },
        })}
      </div>
    </div>
  );
}
