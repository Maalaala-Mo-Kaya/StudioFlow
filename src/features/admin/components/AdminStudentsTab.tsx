import React, { useState, useMemo } from 'react';
import { Search, Filter, Edit3, Trash2, Users, FileDown } from 'lucide-react';
import type { Registration, Organization, Course, Package } from '../../../types';
import { formatCurrency, formatClientName } from '../../../utils/formatters';
import { RegistrationStatusBadge } from '../../../components/RegistrationStatusBadge';
import { EditStudentModal } from './EditStudentModal';
import { generateSignedYellowFormPdf } from '../../../utils/generateSignedPdf';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { useToast } from '../../../context/ToastContext';

interface AdminStudentsTabProps {
  registrations: Registration[];
  organizations: Organization[];
  courses: Course[];
  packages: Package[];
  onUpdateRegistration: (id: string, data: Partial<Registration>) => Promise<void>;
  onDeleteRegistration: (id: string) => Promise<void>;
}

export const AdminStudentsTab: React.FC<AdminStudentsTabProps> = ({
  registrations,
  organizations,
  courses,
  packages,
  onUpdateRegistration,
  onDeleteRegistration,
}) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSchool, setFilterSchool] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [editingStudent, setEditingStudent] = useState<Registration | null>(null);

  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    id: string;
    name: string;
    jobOrderNo: string;
  }>({
    isOpen: false,
    id: '',
    name: '',
    jobOrderNo: '',
  });

  const promptDeleteStudent = (reg: Registration) => {
    setDeleteModalState({
      isOpen: true,
      id: reg.id,
      name: `${reg.given_name} ${reg.family_name}`,
      jobOrderNo: reg.job_order_no,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalState.id) return;
    try {
      await onDeleteRegistration(deleteModalState.id);
      toast.success(`Registration JO № ${deleteModalState.jobOrderNo} cancelled`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete registration');
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return registrations.filter((r) => {
      if (filterSchool !== 'all' && r.organization !== filterSchool) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterPayment !== 'all' && r.payment_status !== filterPayment) return false;

      if (q) {
        const fullName = `${r.given_name} ${r.family_name} ${r.middle_name || ''}`.toLowerCase();
        const jo = (r.job_order_no || '').toLowerCase();
        const sid = (r.student_id || '').toLowerCase();
        const sec = (r.section || '').toLowerCase();
        const school = (r.expand?.organization?.name || '').toLowerCase();
        if (
          !fullName.includes(q) &&
          !jo.includes(q) &&
          !sid.includes(q) &&
          !sec.includes(q) &&
          !school.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [registrations, searchQuery, filterSchool, filterStatus, filterPayment]);

  return (
    <div className="space-y-6 animate-enter font-mono text-xs">
      {/* Search and Filters Bar */}
      <div className="bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Live Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search name, JO №, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#F8F7F4] border border-neutral-400 font-semibold text-xs focus:bg-white"
            />
          </div>

          {/* School Filter */}
          <div className="relative">
            <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <select
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#F8F7F4] border border-neutral-400 font-bold text-xs uppercase focus:bg-white"
            >
              <option value="all">All Schools &amp; Orgs</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.code || 'ORG'})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 bg-[#F8F7F4] border border-neutral-400 font-bold text-xs uppercase focus:bg-white"
            >
              <option value="all">All Queue Statuses</option>
              <option value="pending_payment">Pending Payment</option>
              <option value="paid">Paid (In Queue)</option>
              <option value="shooting">Shooting (On Set)</option>
              <option value="done_shooting">Done Shooting</option>
              <option value="completed">Completed</option>
              <option value="released">Deliverable Released</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <select
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value)}
              className="w-full px-3 py-2 bg-[#F8F7F4] border border-neutral-400 font-bold text-xs uppercase focus:bg-white"
            >
              <option value="all">All Financial Statuses</option>
              <option value="unpaid">Unpaid (Balance Pending)</option>
              <option value="downpayment">Downpayment Only</option>
              <option value="fully_paid">Fully Settled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Student Roster Table */}
      <div className="bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] overflow-hidden">
        <div className="p-4 border-b-2 border-[#0A0A0A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#C9A227]" />
            <h3 className="font-black text-xs uppercase tracking-wider text-[#0A0A0A]">
              Student Registrations
            </h3>
          </div>
          <span className="text-[11px] text-neutral-500 font-bold">
            Showing {filtered.length} of {registrations.length} Students
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0A0A0A] text-[#C9A227] text-[10px] uppercase font-black tracking-wider border-b-2 border-[#0A0A0A]">
                <th className="py-2.5 px-3">JO № &amp; Queue</th>
                <th className="py-2.5 px-3">Student Name</th>
                <th className="py-2.5 px-3">School &amp; Course</th>
                <th className="py-2.5 px-3">Section &amp; Contact</th>
                <th className="py-2.5 px-3">Package</th>
                <th className="py-2.5 px-3 text-right">Balance</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-neutral-400 font-mono">
                    No student registrations match the selected filters.
                  </td>
                </tr>
              ) : (
                filtered.map((reg) => (
                  <tr key={reg.id} className="hover:bg-[#F8F7F4] transition-colors">
                    <td className="py-2.5 px-3 font-mono">
                      <div className="font-black text-red-600">{reg.job_order_no}</div>
                      <div className="text-[10px] text-neutral-500">Q-{reg.queue_number}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-[#0A0A0A]">{formatClientName(reg)}</div>
                      <div className="text-[10px] text-neutral-500 font-mono">
                        {reg.student_id ? `ID: ${reg.student_id}` : 'No ID recorded'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-neutral-800">
                        {reg.expand?.organization?.code || reg.expand?.organization?.name || 'School'}
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        {reg.expand?.course?.code || reg.course || 'Degree'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold">{reg.section || '—'}</div>
                      <div className="text-[10px] text-neutral-500 font-mono">{reg.mobile_number}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-[#0A0A0A]">
                        {reg.expand?.package?.code || 'PKG'}
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        {formatCurrency(reg.total_amount)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      {reg.balance > 0 ? (
                        <span className="text-red-600 font-black">{formatCurrency(reg.balance)}</span>
                      ) : (
                        <span className="text-emerald-700">✓ Settled</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <RegistrationStatusBadge status={reg.status} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => generateSignedYellowFormPdf(reg, { copyType: 'customer', autoDownload: true })}
                          title="Download Signed PDF Yellow Form (T041)"
                          className="btn-tactile inline-flex items-center gap-1 px-2 py-1 bg-[#F8F7F4] text-[#0A0A0A] hover:bg-[#C9A227] hover:text-[#0A0A0A] border border-neutral-300 text-[10px] font-bold uppercase cursor-pointer"
                        >
                          <FileDown className="w-3 h-3 text-[#C9A227]" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingStudent(reg)}
                          title="Edit Student Information"
                          className="btn-tactile inline-flex items-center gap-1 px-2 py-1 bg-[#0A0A0A] text-[#C9A227] hover:bg-neutral-800 text-[10px] font-bold uppercase cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => promptDeleteStudent(reg)}
                          title="Cancel/Delete Registration"
                          className="btn-tactile p-1 text-red-600 hover:bg-red-50 border border-neutral-300 hover:border-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingStudent && (
        <EditStudentModal
          registration={editingStudent}
          organizations={organizations}
          courses={courses}
          packages={packages}
          onClose={() => setEditingStudent(null)}
          onSave={async (id, data) => {
            try {
              await onUpdateRegistration(id, data);
              toast.success('Student record updated');
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : 'Failed to update student');
            }
          }}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalState.isOpen}
        title={`Cancel Registration: JO № ${deleteModalState.jobOrderNo}`}
        message={`Are you sure you want to cancel and delete the registration for ${deleteModalState.name}? This will remove the participant from the active queue.`}
        confirmText="Confirm Delete"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteModalState({ isOpen: false, id: '', name: '', jobOrderNo: '' })}
      />
    </div>
  );
};
