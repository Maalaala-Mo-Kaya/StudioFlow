import React from 'react';
import { useAdminData } from './useAdminData';
import { AdminHeader } from './components/AdminHeader';
import { AdminSidebarNav } from './components/AdminSidebarNav';
import { AdminAnalyticsTab } from './components/AdminAnalyticsTab';
import { AdminOrgsTab } from './components/AdminOrgsTab';
import { AdminPackagesTab } from './components/AdminPackagesTab';
import { AdminRosterTab } from './components/AdminRosterTab';
import { AdminStaffTab } from './components/AdminStaffTab';
import { AdminFramingTab } from './components/AdminFramingTab';
import { AdminStudentsTab } from './components/AdminStudentsTab';

export const AdminPage: React.FC = () => {
  const admin = useAdminData();

  return (
    <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8">
      {/* Executive Header */}
      <AdminHeader onExportCsv={admin.exportCsv} />

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
          {admin.activeTab === 'metrics' && (
            <AdminAnalyticsTab
              metrics={admin.metrics}
              organizations={admin.organizations}
              registrations={admin.registrations}
              packages={admin.packages}
              onExportCsv={admin.exportCsv}
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
              newPkgCode={admin.newPkgCode}
              onNewPkgCodeChange={admin.setNewPkgCode}
              newPkgName={admin.newPkgName}
              onNewPkgNameChange={admin.setNewPkgName}
              newPkgAmount={admin.newPkgAmount}
              onNewPkgAmountChange={admin.setNewPkgAmount}
              newPkgInclusions={admin.newPkgInclusions}
              onNewPkgInclusionsChange={admin.setNewPkgInclusions}
              onAddPackage={admin.handleAddPackage}
              onUpdatePackage={admin.handleUpdatePackage}
              onTogglePackageActive={admin.handleTogglePackageActive}
              onDeletePackage={admin.handleDeletePackage}
              onAddAddOn={admin.handleAddAddOn}
              onUpdateAddOn={admin.handleUpdateAddOn}
              onToggleAddOnActive={admin.handleToggleAddOnActive}
              onDeleteAddOn={admin.handleDeleteAddOn}
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
              onUpdateRegistration={admin.handleUpdateRegistration}
              onDeleteRegistration={admin.handleDeleteRegistration}
            />
          )}

          {/* TAB 6: FRAMING SCHEDULE (T047) */}
          {admin.activeTab === 'framing' && (
            <AdminFramingTab
              registrations={admin.registrations}
              onUpdateFramingStatus={admin.handleUpdateFramingStatus}
            />
          )}

          {/* TAB 7: STAFF ACCOUNTS & ROLE MANAGEMENT */}
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
            />
          )}
        </main>
      </div>
    </div>
  );
};
