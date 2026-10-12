import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";

// GET /api/projects/[id]/members — list all members of a project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Get project owner + members
    const [project, members] = await Promise.all([
      dbRead.project.findUnique({
        where: { id },
        select: {
          ownerId: true,
          owner: { select: { id: true, name: true, email: true, image: true } },
        },
      }),
      dbRead.projectMember.findMany({
        where: { projectId: id },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      owner: project.owner,
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        user: m.user,
      })),
    });
  } catch (error) {
    console.error("GET members error:", error);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

// POST /api/projects/[id]/members — add a member to the project
// Body: { email: string, role: "viewer" | "editor" }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { email, role } = body;

    if (!email || typeof email !== "string" || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const validRole = role === "editor" ? "editor" : "viewer";

    // Find or create user by email
    let user = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      user = await db.user.create({
        data: { email: normalizedEmail, name: normalizedEmail.split("@")[0] },
      });
    }

    // Check if already a member
    const existing = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: user.id } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "User is already a member of this project" },
        { status: 409 },
      );
    }

    // Check if user is the owner (can't be added as member)
    const project = await db.project.findUnique({ where: { id }, select: { ownerId: true } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.ownerId === user.id) {
      return NextResponse.json(
        { error: "User is already the owner of this project" },
        { status: 409 },
      );
    }

    const member = await db.projectMember.create({
      data: {
        projectId: id,
        userId: user.id,
        role: validRole,
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json({
      id: member.id,
      role: member.role,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      user: member.user,
    }, { status: 201 });
  } catch (error) {
    console.error("POST member error:", error);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
