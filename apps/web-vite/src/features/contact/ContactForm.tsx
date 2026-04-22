// Human: Marketing contact form that posts to the public contact endpoint and shows inline success or error feedback.
// Agent: LOCAL state fields; SUBMITS via api client; HANDLES ApiError; READS APP_CONFIG for copy; LINKS back to ROUTES.

import React from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { api, ApiError } from "@/api/client";

export function ContactForm() {
  const [formData, setFormData] = React.useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitStatus, setSubmitStatus] = React.useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus({ type: null, message: "" });

    try {
      const data = await api.post<{ message?: string; error?: string; details?: Array<{ field: string; message: string }> }>(
        "/contact",
        formData
      );

      const response = data as { message?: string; error?: string; details?: Array<{ field: string; message: string }> } | undefined;
      if (response?.error) {
        if (response.details && response.details.length > 0) {
          const firstError = response.details[0];
          setSubmitStatus({
            type: "error",
            message: `${firstError.field}: ${firstError.message}`,
          });
        } else {
          setSubmitStatus({
            type: "error",
            message: response.error || "Something went wrong. Please try again later.",
          });
        }
        return;
      }

      setSubmitStatus({
        type: "success",
        message: response?.message || "Thank you for your message! We'll get back to you soon.",
      });
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429) {
          setSubmitStatus({
            type: "error",
            message: "Too many requests. Please try again later.",
          });
        } else {
          setSubmitStatus({
            type: "error",
            message: error.message || "Something went wrong. Please try again.",
          });
        }
      } else {
        setSubmitStatus({
          type: "error",
          message: "Network error. Please check your connection and try again.",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <Link
              to={ROUTES.HOME}
              className="inline-block mb-6 text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent"
            >
              {APP_CONFIG.name}
            </Link>
            <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">
              Contact Us
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              We&apos;d love to hear from you. Send us a message and we&apos;ll respond as soon as possible.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="rounded-xl border border-neutral-200/90 bg-white/95 p-6 shadow-soft-xl ring-1 ring-neutral-900/[0.04] backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95 dark:ring-white/[0.06]">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">
                  Get in Touch
                </h2>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center mb-2">
                      <svg
                        className="w-5 h-5 text-primary-600 dark:text-primary-400 mr-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        Email
                      </h3>
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400 text-sm ml-8">
                      <a
                        href={`mailto:contact@${APP_CONFIG.name.toLowerCase()}.com`}
                        className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      >
                        contact@{APP_CONFIG.name.toLowerCase()}.com
                      </a>
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center mb-2">
                      <svg
                        className="w-5 h-5 text-primary-600 dark:text-primary-400 mr-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        Response Time
                      </h3>
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400 text-sm ml-8">
                      We typically respond within 24 hours
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="rounded-xl border border-neutral-200/90 bg-white/95 p-8 shadow-soft-xl ring-1 ring-neutral-900/[0.04] backdrop-blur-sm sm:p-12 dark:border-neutral-700 dark:bg-neutral-900/95 dark:ring-white/[0.06]">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {submitStatus.type === "success" && (
                    <div className="rounded-lg bg-success-50 dark:bg-success-950 border-2 border-success-200 dark:border-success-800 p-4">
                      <div className="flex items-start gap-3">
                        <svg
                          className="w-5 h-5 text-success-600 dark:text-success-400 mt-0.5 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="text-sm font-medium text-success-800 dark:text-success-200">
                          {submitStatus.message}
                        </p>
                      </div>
                    </div>
                  )}

                  {submitStatus.type === "error" && (
                    <div className="rounded-lg bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 p-4">
                      <div className="flex items-start gap-3">
                        <svg
                          className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="text-sm font-medium text-error-800 dark:text-error-200">
                          {submitStatus.message}
                        </p>
                      </div>
                    </div>
                  )}

                  <Input
                    label="Your Name"
                    type="text"
                    name="name"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />

                  <Input
                    label="Email Address"
                    type="email"
                    name="email"
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    helperText="We'll use this to respond to your inquiry"
                    required
                  />

                  <Input
                    label="Subject"
                    type="text"
                    name="subject"
                    placeholder="What is this regarding?"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                  />

                  <Textarea
                    label="Message"
                    name="message"
                    placeholder="Tell us how we can help you..."
                    value={formData.message}
                    onChange={handleChange}
                    rows={6}
                    helperText="Please provide as much detail as possible"
                    required
                  />

                  <div className="pt-4">
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      className="w-full sm:w-auto"
                      disabled={isSubmitting}
                      loading={isSubmitting}
                    >
                      {isSubmitting ? "Sending..." : "Send Message"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link
              to={ROUTES.HOME}
              className="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
