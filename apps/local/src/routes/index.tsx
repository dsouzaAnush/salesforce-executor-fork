import { createFileRoute } from "@tanstack/react-router";
import { SalesforceSourcesPage } from "../salesforce/SalesforceSourcesPage";

export const Route = createFileRoute("/")({
  component: SalesforceSourcesPage,
});
