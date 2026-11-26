import { useEffect, useState } from 'react';
import { pb } from '../../../db/pocketbase';
import type { AddOn, Course, Level, Organization, Package, Registration, SchoolCourse, SessionType } from '../../../types';
import { Modal } from '../../../components/common/Modal';
import { EditStudentModal } from '../../admin/components/EditStudentModal';

interface EditData {
  registration: Registration;
  organizations: Organization[];
  courses: Course[];
  packages: Package[];
  addOns: AddOn[];
  levels: Level[];
  schoolCourses: SchoolCourse[];
}

const expand = 'organization,level,course,package,session_type';

export function CashierRegistrationEditor({ id, sessionTypes, onClose, onSaved }: {
  id: string;
  sessionTypes: SessionType[];
  onClose: () => void;
  onSaved: (record: Registration) => void;
}) {
  const [data, setData] = useState<EditData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void Promise.all([
      pb.collection('registrations').getOne<Registration>(id, { expand, cache: 'no-store', signal }),
      pb.collection('organizations').getFullList<Organization>({ sort: 'name', signal }),
      pb.collection('courses').getFullList<Course>({ sort: 'name', signal }),
      pb.collection('packages').getFullList<Package>({ sort: 'name', signal }),
      pb.collection('add_ons').getFullList<AddOn>({ sort: 'name', signal }),
      pb.collection('levels').getFullList<Level>({ sort: 'name', signal }),
      pb.collection('school_courses').getFullList<SchoolCourse>({ signal }),
      pb.send<string[]>('/api/studioflow/cashier-editable-registrations', { query: { id }, cache: 'no-store', signal }),
    ]).then(([registration, organizations, courses, packages, addOns, levels, schoolCourses, eligible]) => {
      if (signal.aborted) return;
      if (!eligible.includes(id) || registration.status !== 'pending_payment' || registration.paid_amount !== 0 || registration.job_order_no) {
        setError('This client is no longer eligible for editing. Check for a payment or an issued job order.');
      } else {
        setData({ registration, organizations, courses, packages, addOns, levels, schoolCourses });
      }
    }).catch(() => { if (!signal.aborted) setError('Could not open this registration. Refresh the pending client list and try again.'); });
    return () => controller.abort();
  }, [id]);

  if (!data) {
    return (
      <Modal title="Edit Client" subtitle={`Registration ${id}`} onClose={onClose} size="xl" fixedHeight>
        {error ? <p role="alert" className="text-red-600">{error}</p> : <p role="status">Loading registration…</p>}
      </Modal>
    );
  }
  return (
    <EditStudentModal registration={data.registration} organizations={data.organizations} courses={data.courses}
      packages={data.packages} addOnCatalog={data.addOns} cashierCatalog={{ ...data, sessionTypes }} onClose={onClose}
      onSave={async (registrationId, changes) => {
        const saved = await pb.collection('registrations').update<Registration>(
          registrationId, { ...changes, cashier_edit_version: data.registration.updated }, { expand },
        );
        onSaved(saved);
      }} />
  );
}
