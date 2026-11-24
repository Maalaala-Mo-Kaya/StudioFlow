import { useEffect, useState } from 'react';
import { pb } from '../../../db/pocketbase';
import type { AddOn, Course, Level, Organization, Package, Registration, SchoolCourse } from '../../../types';
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

export function CashierRegistrationEditor({ id, onClose, onSaved }: {
  id: string;
  onClose: () => void;
  onSaved: (record: Registration) => void;
}) {
  const [data, setData] = useState<EditData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      pb.collection('registrations').getOne<Registration>(id, { expand, cache: 'no-store' }),
      pb.collection('organizations').getFullList<Organization>({ sort: 'name' }),
      pb.collection('courses').getFullList<Course>({ sort: 'name' }),
      pb.collection('packages').getFullList<Package>({ sort: 'name' }),
      pb.collection('add_ons').getFullList<AddOn>({ sort: 'name' }),
      pb.collection('levels').getFullList<Level>({ sort: 'name' }),
      pb.collection('school_courses').getFullList<SchoolCourse>(),
      pb.send<string[]>('/api/studioflow/cashier-editable-registrations', { cache: 'no-store' }),
    ]).then(([registration, organizations, courses, packages, addOns, levels, schoolCourses, eligible]) => {
      if (!active) return;
      if (!eligible.includes(id) || registration.status !== 'pending_payment' || registration.paid_amount !== 0 || registration.job_order_no) {
        setError('This client is no longer eligible for editing. Check for a payment or an issued job order.');
      } else {
        setData({ registration, organizations, courses, packages, addOns, levels, schoolCourses });
      }
    }).catch(() => { if (active) setError('Could not open this registration. Refresh the pending client list and try again.'); });
    return () => { active = false; };
  }, [id]);

  if (!data) {
    return (
      <Modal title="Edit Client" onClose={onClose} size="md">
        {error ? <p role="alert" className="text-red-600">{error}</p> : <p role="status">Loading registration…</p>}
      </Modal>
    );
  }
  return (
    <EditStudentModal registration={data.registration} organizations={data.organizations} courses={data.courses}
      packages={data.packages} addOnCatalog={data.addOns} cashierCatalog={data} onClose={onClose}
      onSave={async (registrationId, changes) => {
        const saved = await pb.collection('registrations').update<Registration>(
          registrationId, { ...changes, cashier_edit_version: data.registration.updated }, { expand },
        );
        onSaved(saved);
      }} />
  );
}
