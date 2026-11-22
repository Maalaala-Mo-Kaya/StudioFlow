import React, { useState } from 'react';
import { useAdminData } from './useAdminData';
import { AdminHeader } from './components/AdminHeader';
import { AdminSidebarNav } from './components/AdminSidebarNav';
import { AdminAnalyticsTab } from './components/AdminAnalyticsTab';
import { AdminOrgsTab } from './components/AdminOrgsTab';
import { AdminPackagesTab } from './components/AdminPackagesTab';
import { AdminCatalogImportTab } from './components/AdminCatalogImportTab';
import { AdminRosterTab } from './components/AdminRosterTab';
import { AdminStaffTab } from './components/AdminStaffTab';
import { AdminProductionTab } from './components/AdminProductionTab';
import { AdminStudentsTab } from './components/AdminStudentsTab';
import { MakeupPage } from '../workflow/MakeupPage';
import { ChooserPage } from '../workflow/ChooserPage';
import { stationButton } from '../workflow/StationLayout';
import { CameraSettings } from '../camera/CameraSettings';
import { AdminClientTypesTab } from './components/AdminClientTypesTab';
import { MuaTeamSettings } from './components/MuaTeamSettings';

export const AdminPage: React.FC = () => {
  const admin = useAdminData();
  const [workflow, setWorkflow] = useState<'makeup' | 'photos'>('makeup');

  return (
    <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8">
      {/* Executive Header */}
      <AdminHeader onExportCsv={admin.exportCsv} onExportExcel={admin.exportExcel} exportingExcel={admin.exportingExcel}
        organizations={admin.organizations} registrations={admin.registrations} />

      {/* Main Admin Two-Column Layout with Sidebar Navigation */}
      <div className="flex flex-col lg:flex-row gap-6 mt-6 items-start">
        {/* Sidebar Navigation */}
        <AdminSidebarNav
          activeTab={admin.activeTab}
          onSelectTab={admin.setActiveTab}
          studentCount={admin.registrations.length}
          packageCount={admin.packages.length}
          schoolCount={admin.organizations.length}
        />

        {/* Tab Content Panel */}
        <main className="flex-1 min-w-0 w-full">
          {/* TAB 1: OPERATIONS METRICS & RECONCILIATION */}
          {(admin.activeTab === 'metrics' || admin.activeTab === 'ledger') && (
            <AdminAnalyticsTab
              view={admin.activeTab === 'ledger' ? 'ledger' : 'overview'}
              onOpenLedger={() => admin.setActiveTab('ledger')}
              metrics={admin.metrics}
              organizations={admin.organizations}
              registrations={admin.registrations}
              packages={admin.packages}
              addOns={admin.addOns}
              onOpenCatalog={() => admin.setActiveTab('packages')}
              onOpenStudents={() => admin.setActiveTab('students')}
              payments={admin.payments}
              refunds={admin.refunds}
              onVoidPayment={admin.handleVoidPayment}
              onRefund={admin.handleRefund}
            />
          )}

          {/* TAB 2: ORGANIZATIONS & COURSES (T018, T019) */}
          {admin.activeTab === 'orgs' && (
            <AdminOrgsTab
              organizations={admin.organizations}
              levels={admin.levels}
              courses={admin.courses}
              schoolCourses={admin.schoolCourses}
              courseCatalogStatus={admin.courseCatalogStatus}
              newOrgName={admin.newOrgName}
              onNewOrgNameChange={admin.setNewOrgName}
              newOrgCode={admin.newOrgCode}
              onNewOrgCodeChange={admin.setNewOrgCode}
              onAddOrg={admin.handleAddOrg}
              onUpdateOrg={admin.handleUpdateOrg}
              onToggleOrgActive={admin.handleToggleOrgActive}
              onDeleteOrg={admin.handleDeleteOrg}
              onAddCourse={admin.handleAddCourse}
              onUpdateCourse={admin.handleUpdateCourse}
              onRemoveCourse={admin.handleRemoveCourse}
            />
          )}

          {/* TAB 3: PACKAGES & ADD-ONS (T020) */}
          {admin.activeTab === 'packages' && (
            <AdminPackagesTab
              packages={admin.packages}
              addOns={admin.addOns}
              catalogItems={admin.catalogItems}
              itemPackages={admin.itemPackages}
              onSavePackage={admin.handleSavePackage}
              onSaveCatalogItem={admin.handleSaveCatalogItem}
              onDeleteCatalogItem={admin.handleDeleteCatalogItem}
              onSaveItemPackage={admin.handleSaveItemPackage}
              onDeleteItemPackage={admin.handleDeleteItemPackage}
              onTogglePackageActive={admin.handleTogglePackageActive}
              onDeletePackage={admin.handleDeletePackage}
              onAddAddOn={admin.handleAddAddOn}
              onUpdateAddOn={admin.handleUpdateAddOn}
              onToggleAddOnActive={admin.handleToggleAddOnActive}
              onDeleteAddOn={admin.handleDeleteAddOn}
            />
          )}

          {/* Packages & Add-ons → Import from File */}
          {admin.activeTab === 'catalog-import' && (
            <AdminCatalogImportTab
              packages={admin.packages}
              addOns={admin.addOns}
              onSave={admin.handleImportCatalog}
              onRestore={admin.handleRestoreCatalog}
              onOpenCatalog={() => admin.setActiveTab('packages')}
            />
          )}

          {/* TAB 4: ROSTER INGESTION & MASTER LIST (T021, T022) */}
          {admin.activeTab === 'roster' && (
            <AdminRosterTab
              organizations={admin.organizations}
              masterList={admin.masterList}
              rosterOrgId={admin.rosterOrgId}
              onRosterOrgIdChange={admin.setRosterOrgId}
              csvText={admin.csvText}
              onCsvTextChange={admin.setCsvText}
              onImportRoster={admin.handleImportRoster}
              onDeleteMasterListItem={admin.handleDeleteMasterListItem}
              onClearMasterList={admin.handleClearMasterList}
            />
          )}

          {/* TAB 5: STUDENT PARTICIPANT DIRECTORY & MANAGEMENT (T028) */}
          {admin.activeTab === 'students' && (
            <AdminStudentsTab
              registrations={admin.registrations}
              organizations={admin.organizations}
              levels={admin.levels}
              courses={admin.courses}
              packages={admin.packages}
              addOns={admin.addOns}
              onUpdateRegistration={admin.handleUpdateRegistration}
              onCancelRegistration={admin.handleCancelRegistration}
              onRestoreRegistration={admin.handleRestoreRegistration}
            />
          )}

          {/* TAB 6: PRODUCTION & PICKUP (framing, printing, ready for pickup) */}
          {admin.activeTab === 'framing' && (
            <AdminProductionTab
              registrations={admin.registrations}
              onSetProductionStatus={admin.handleSetProductionStatus}
            />
          )}

          {/* TAB 7: STAFF ACCOUNTS & ROLE MANAGEMENT */}
          {admin.activeTab === 'workflow' && (
            <div className="space-y-5">
              <div role="tablist" className="flex flex-wrap gap-2" aria-label="Workflow reports">
                <button role="tab" type="button" className={`${stationButton} ${workflow === 'makeup' ? 'border-b-4 border-b-gold bg-obsidian !text-gold' : 'bg-panel !text-ink'}`} aria-selected={workflow === 'makeup'} onClick={() => setWorkflow('makeup')}>Makeup / Grooming</button>
                <button role="tab" type="button" className={`${stationButton} ${workflow === 'photos' ? 'border-b-4 border-b-gold bg-obsidian !text-gold' : 'bg-panel !text-ink'}`} aria-selected={workflow === 'photos'} onClick={() => setWorkflow('photos')}>Photo Selection</button>
              </div>
              {workflow === 'makeup' ? <MakeupPage embedded teamSettings={<MuaTeamSettings />} /> : <ChooserPage embedded />}
            </div>
          )}

          {admin.activeTab === 'camera' && <CameraSettings />}
          {admin.activeTab === 'clients' && <AdminClientTypesTab />}

          {admin.activeTab === 'staff' && (
            <AdminStaffTab
              staffAccounts={admin.staffAccounts}
              staffUsername={admin.staffUsername}
              onStaffUsernameChange={admin.setStaffUsername}
              staffPassword={admin.staffPassword}
              onStaffPasswordChange={admin.setStaffPassword}
              staffName={admin.staffName}
              onStaffNameChange={admin.setStaffName}
              staffRole={admin.staffRole}
              onStaffRoleChange={admin.setStaffRole}
              onCreateStaff={admin.handleCreateStaff}
              onDeleteStaff={admin.handleDeleteStaff}
              onUpdateStaff={admin.handleUpdateStaff}
              onResetStaffPassword={admin.handleResetStaffPassword}
            />
          )}
        </main>
      </div>
    </div>
  );
};
