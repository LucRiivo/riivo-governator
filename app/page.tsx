'use client';

import React, { useState } from 'react';
import Sidebar, { Tenant } from '@/components/Sidebar';
import Header from '@/components/Header';
import ComponentList from '@/components/ComponentList';
import AnalysisView from '@/components/AnalysisView';
import ConnectionModal from '@/components/ConnectionModal';
import SecurityList from '@/components/security/SecurityList';
import SecurityAnalysisView from '@/components/security/SecurityAnalysisView';
import WebResourceList from '@/components/webresources/WebResourceList';
import WebResourceDetailView from '@/components/webresources/WebResourceDetailView';
import AppList from '@/components/apps/AppList';
import AppDetailView from '@/components/apps/AppDetailView';
import TelemetryDashboard from '@/components/telemetry/TelemetryDashboard';
import StorageDashboard from '@/components/storage/StorageDashboard';
import EnvironmentDashboard from '@/components/dashboard/EnvironmentDashboard';
import AppInsightsConnection from '@/components/settings/AppInsightsConnection';
import PowerPlatformAdminConnection from '@/components/settings/PowerPlatformAdminConnection';
import BulkDocumentationPanel from '@/components/BulkDocumentationPanel';
import { MOCK_ANALYSIS_RESULT } from '@/lib/mockData';

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

import { useOrganization } from "@clerk/nextjs";

const SECURITY_TABS = ['security-bu', 'security-roles', 'security-teams'];
const WEB_RESOURCE_TAB = 'webresources';
const APPS_TAB = 'apps';
const DASHBOARD_TAB = 'dashboard';
const TELEMETRY_TAB = 'telemetry';
const STORAGE_TAB = 'storage';
const SETTINGS_APPINSIGHTS_TAB = 'settings-appinsights';
const SETTINGS_PPADMIN_TAB = 'settings-ppadmin';
const FULL_PAGE_TABS = [DASHBOARD_TAB, TELEMETRY_TAB, STORAGE_TAB, SETTINGS_APPINSIGHTS_TAB, SETTINGS_PPADMIN_TAB];

export default function Home() {
  const [selectedTab, setSelectedTab] = useState('dashboard');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAppInsightsModalOpen, setIsAppInsightsModalOpen] = useState(false);
  const [isPPAdminModalOpen, setIsPPAdminModalOpen] = useState(false);
  const [isBulkDocsOpen, setIsBulkDocsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Clerk Organization
  const { organization } = useOrganization();
  const orgId = organization?.id;

  // Tenant State
  const tenants = useQuery(api.queries.getTenants, { orgId }) || [];
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  // Derive active tenant object
  const activeTenant = tenants.find((t: any) => t.tenantId === activeTenantId) || tenants[0] || null;

  // Tab type helpers
  const isSecurityTab = SECURITY_TABS.includes(selectedTab);
  const isWebResourceTab = selectedTab === WEB_RESOURCE_TAB;
  const isAppsTab = selectedTab === APPS_TAB;
  const isDashboardTab = selectedTab === DASHBOARD_TAB;
  const isTelemetryTab = selectedTab === TELEMETRY_TAB;
  const isStorageTab = selectedTab === STORAGE_TAB;
  const isSettingsAppInsights = selectedTab === SETTINGS_APPINSIGHTS_TAB;
  const isSettingsPPAdmin = selectedTab === SETTINGS_PPADMIN_TAB;
  const isFullPageTab = FULL_PAGE_TABS.includes(selectedTab);

  // Security data queries (for detail views)
  const businessUnits = useQuery(
    api.queries.getBusinessUnits,
    activeTenant?.tenantId ? { tenantId: activeTenant.tenantId } : "skip"
  ) || [];
  const securityRoles = useQuery(
    api.queries.getSecurityRoles,
    activeTenant?.tenantId ? { tenantId: activeTenant.tenantId } : "skip"
  ) || [];
  const securityTeams = useQuery(
    api.queries.getSecurityTeams,
    activeTenant?.tenantId ? { tenantId: activeTenant.tenantId } : "skip"
  ) || [];

  // Effect to set default active tenant
  React.useEffect(() => {
    if (!activeTenantId && tenants.length > 0) {
      setActiveTenantId(tenants[0].tenantId);
    }
  }, [tenants, activeTenantId]);

  // Reset selected item when tab changes
  React.useEffect(() => {
    setSelectedItem(null);
    setAnalysisResult(null);
  }, [selectedTab]);

  // Reset analysis result when selected item changes
  React.useEffect(() => {
    setAnalysisResult(null);
  }, [selectedItem]);

  const analyzeFlow = useAction(api.claude.analyzeFlow);

  const handleStartAnalysis = async () => {
    if (!selectedItem || !activeTenantId) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const result = await analyzeFlow({ tenantId: activeTenantId, flowId: selectedItem.workflowId, orgId, forceRefresh: true });
      setAnalysisResult(result);
    } catch (error) {
      console.error("Analysis failed:", error);
      setAnalysisResult({
        summary: "Analysis failed. See console for details.",
        findings: [
          {
            type: "error",
            category: "System",
            title: "Analysis Error",
            description: error instanceof Error ? error.message : "Unknown error occurred",
            suggestion: "Check your API key and connection."
          }
        ]
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        tenants={tenants}
        activeTenant={activeTenant}
        setActiveTenant={(t: any) => setActiveTenantId(t.tenantId)}
        setIsModalOpen={setIsModalOpen}
        selectedTab={selectedTab}
        setSelectedTab={setSelectedTab}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <Header activeTenant={activeTenant} searchQuery={searchQuery} onSearchChange={setSearchQuery} />

        <div className="flex-1 flex overflow-hidden">
          {/* Full-page tabs (no left panel) */}
          {isFullPageTab ? (
            <div className="flex-1 bg-slate-50 p-8 overflow-y-auto">
              {isDashboardTab && (
                <EnvironmentDashboard
                  activeTenant={activeTenant}
                  orgId={orgId}
                  onNavigate={(tab: string) => setSelectedTab(tab)}
                />
              )}
              {isTelemetryTab && (
                <TelemetryDashboard
                  activeTenant={activeTenant}
                  orgId={orgId}
                  onOpenSettings={() => setIsAppInsightsModalOpen(true)}
                />
              )}
              {isStorageTab && (
                <StorageDashboard
                  activeTenant={activeTenant}
                  orgId={orgId}
                  onOpenSettings={() => setIsPPAdminModalOpen(true)}
                />
              )}
              {isSettingsAppInsights && (
                <AppInsightsSettingsPage
                  activeTenant={activeTenant}
                  orgId={orgId}
                  onOpenModal={() => setIsAppInsightsModalOpen(true)}
                />
              )}
              {isSettingsPPAdmin && (
                <PPAdminSettingsPage
                  activeTenant={activeTenant}
                  orgId={orgId}
                  onOpenModal={() => setIsPPAdminModalOpen(true)}
                />
              )}
            </div>
          ) : (
            <>
              {/* Left Panel - List */}
              {isSecurityTab ? (
                <SecurityList
                  selectedTab={selectedTab}
                  selectedItem={selectedItem}
                  setSelectedItem={setSelectedItem}
                  activeTenantId={activeTenant?.tenantId}
                  orgId={orgId}
                  searchQuery={searchQuery}
                />
              ) : isWebResourceTab ? (
                <WebResourceList
                  selectedItem={selectedItem}
                  setSelectedItem={setSelectedItem}
                  activeTenantId={activeTenant?.tenantId}
                  orgId={orgId}
                  searchQuery={searchQuery}
                />
              ) : isAppsTab ? (
                <AppList
                  selectedItem={selectedItem}
                  setSelectedItem={setSelectedItem}
                  activeTenantId={activeTenant?.tenantId}
                  orgId={orgId}
                  searchQuery={searchQuery}
                />
              ) : (
                <ComponentList
                  selectedTab={selectedTab}
                  selectedItem={selectedItem}
                  setSelectedItem={setSelectedItem}
                  activeTenantId={activeTenant?.tenantId}
                  orgId={orgId}
                  searchQuery={searchQuery}
                  onBulkDocs={() => setIsBulkDocsOpen(true)}
                />
              )}

              {/* Right Panel - Analysis/Detail */}
              <div className="flex-1 bg-slate-50 p-8 overflow-y-auto">
                {isSecurityTab ? (
                  <SecurityAnalysisView
                    selectedItem={selectedItem}
                    selectedTab={selectedTab}
                    activeTenant={activeTenant}
                    orgId={orgId}
                    businessUnits={businessUnits}
                    securityRoles={securityRoles}
                    securityTeams={securityTeams}
                  />
                ) : isWebResourceTab ? (
                  <WebResourceDetailView
                    selectedItem={selectedItem}
                    activeTenant={activeTenant}
                    orgId={orgId}
                  />
                ) : isAppsTab ? (
                  <AppDetailView
                    selectedItem={selectedItem}
                    activeTenant={activeTenant}
                    orgId={orgId}
                  />
                ) : (
                  <AnalysisView
                    selectedItem={selectedItem}
                    selectedTab={selectedTab}
                    activeTenant={activeTenant}
                    isAnalyzing={isAnalyzing}
                    analysisResult={analysisResult}
                    onStartAnalysis={handleStartAnalysis}
                    orgId={orgId}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <ConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        orgId={orgId}
      />

      <AppInsightsConnection
        isOpen={isAppInsightsModalOpen}
        onClose={() => setIsAppInsightsModalOpen(false)}
        tenantId={activeTenant?.tenantId}
        orgId={orgId}
      />

      <PowerPlatformAdminConnection
        isOpen={isPPAdminModalOpen}
        onClose={() => setIsPPAdminModalOpen(false)}
        tenantId={activeTenant?.tenantId}
        orgId={orgId}
      />

      {activeTenant?.tenantId && (
        <BulkDocumentationPanel
          isOpen={isBulkDocsOpen}
          onClose={() => setIsBulkDocsOpen(false)}
          tenantId={activeTenant.tenantId}
          orgId={orgId}
        />
      )}
    </div>
  );
}

// Inline settings page for App Insights (when navigating to Settings > App Insights)
function AppInsightsSettingsPage({ activeTenant, orgId, onOpenModal }: { activeTenant: any; orgId?: string; onOpenModal: () => void }) {
  const connection = useQuery(
    api.queries.getAppInsightsConnection,
    activeTenant?.tenantId ? { tenantId: activeTenant.tenantId } : "skip"
  );

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Application Insights Settings</h2>
      <p className="text-sm text-slate-400 mb-8">
        Configure the Application Insights connection for the active tenant to enable telemetry monitoring.
      </p>

      {connection ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 w-10 h-10 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Connected</p>
              <p className="text-xs text-slate-400">{connection.displayName || 'Application Insights'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Application ID</span>
              <p className="text-slate-600 font-mono text-xs mt-0.5">{connection.appInsightsAppId}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Tested</span>
              <p className="text-slate-600 text-xs mt-0.5">
                {connection.lastTestedAt ? new Date(connection.lastTestedAt).toLocaleString() : 'N/A'}
              </p>
            </div>
          </div>

          <button
            onClick={onOpenModal}
            className="text-sm text-violet-600 font-semibold hover:text-violet-700 transition-colors"
          >
            Update Connection &rarr;
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <p className="text-slate-500 mb-4">No Application Insights connection configured for this tenant.</p>
          <button
            onClick={onOpenModal}
            className="bg-violet-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-violet-700 transition-all text-sm"
          >
            Connect Application Insights
          </button>
        </div>
      )}
    </div>
  );
}

// Inline settings page for Power Platform Admin API
function PPAdminSettingsPage({ activeTenant, orgId, onOpenModal }: { activeTenant: any; orgId?: string; onOpenModal: () => void }) {
  const connection = useQuery(
    api.queries.getPPAdminConnection,
    activeTenant?.tenantId ? { tenantId: activeTenant.tenantId } : "skip"
  );

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Power Platform Admin API Settings</h2>
      <p className="text-sm text-slate-400 mb-8">
        Configure the Power Platform Admin API connection for the active tenant to enable environment storage monitoring.
      </p>

      {connection ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 w-10 h-10 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Connected</p>
              <p className="text-xs text-slate-400">{connection.displayName || 'Power Platform Admin'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Azure Tenant ID</span>
              <p className="text-slate-600 font-mono text-xs mt-0.5">{connection.ppTenantId}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client ID</span>
              <p className="text-slate-600 font-mono text-xs mt-0.5">{connection.clientId}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Tested</span>
              <p className="text-slate-600 text-xs mt-0.5">
                {connection.lastTestedAt ? new Date(connection.lastTestedAt).toLocaleString() : 'N/A'}
              </p>
            </div>
          </div>

          <button
            onClick={onOpenModal}
            className="text-sm text-teal-600 font-semibold hover:text-teal-700 transition-colors"
          >
            Update Connection &rarr;
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <p className="text-slate-500 mb-4">No Power Platform Admin connection configured for this tenant.</p>
          <button
            onClick={onOpenModal}
            className="bg-teal-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-teal-700 transition-all text-sm"
          >
            Connect Power Platform Admin API
          </button>
        </div>
      )}
    </div>
  );
}
